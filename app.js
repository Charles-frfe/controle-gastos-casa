// ==========================================
// 1. CONEXÃO COM O FIREBASE
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyAT7PBkkTXOcyrQnMW_GMOu-5lWKHvKknU",
    authDomain: "gastoscasa-533fd.firebaseapp.com",
    projectId: "gastoscasa-533fd",
    storageBucket: "gastoscasa-533fd.firebasestorage.app",
    messagingSenderId: "277602859849",
    appId: "1:277602859849:web:b2fa2a2fec995a40a1f898",
    measurementId: "G-LB42905Q66"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

let lancamentos = [];
let receitas = [];
let categorias = [];
let meuGrafico = null;
let restaurandoBackup = false;

const categoriasPadrao = [
    "🛒 Mercado", "🐱 Gatas", "💊 Farmácia", "🚗 Uber / Transportes", 
    "🎉 Extra / Lazer", "💡 Água + Luz", "🌐 Internet", "📱 Vivo / Telefonia", 
    "🚘 Carro", "📺 Streamings", "🏠 Invest. Cons. Casa", 
    "🚗 Invest. Cons. Carro", "🛡️ Reserva"
];

// Preenche a data de hoje
document.getElementById('data').valueAsDate = new Date();

const form = document.getElementById('form-gastos');
const tabelaBody = document.getElementById('tabela-gastos-body');
const filtroMesAno = document.getElementById('filtro-mes-ano');
const btnMesAtual = document.getElementById('btn-mes-atual');
const btnExportar = document.getElementById('btn-exportar');
const btnExportarJson = document.getElementById('btn-exportar-json');
const inputImportarJson = document.getElementById('input-importar-json');
const btnLimparTudo = document.getElementById('btn-limpar-tudo');
const formEntradaExtra = document.getElementById('form-entrada-extra');

const selectCategoria = document.getElementById('categoria');
const modalCat = document.getElementById('modal-categorias');
const btnOpenModalCat = document.getElementById('btn-modal-categoria');
const btnCloseModalCat = document.getElementById('btn-fechar-modal-cat');
const formNovaCat = document.getElementById('form-nova-categoria');
const listaCatModal = document.getElementById('lista-categorias-modal');
const colecoesSincronizadas = new Map();
const statusApp = document.getElementById('status-app');

function mostrarStatusApp(mensagem, erro = false) {
    if (!statusApp) return;
    statusApp.textContent = mensagem;
    statusApp.classList.toggle('erro', erro);
}

function registrarSincronizacao(nome, veioDoCache) {
    colecoesSincronizadas.set(nome, Boolean(veioDoCache));
    if (colecoesSincronizadas.size === 3) {
        const existeCacheLocal = [...colecoesSincronizadas.values()].some(Boolean);
        mostrarStatusApp(existeCacheLocal ? 'Dados carregados; aguardando confirmação do Firebase.' : 'Dados sincronizados com o Firebase.');
    }
}

function erroSincronizacao(nome) {
    return (error) => {
        console.error(`Falha ao sincronizar ${nome}:`, error);
        mostrarStatusApp(`Falha ao sincronizar ${nome}. Verifique a conexão e as permissões do Firebase.`, true);
    };
}

// ==========================================
// 2. ESCUTAS EM TEMPO REAL (FIREBASE)
// ==========================================

// Lançamentos
db.collection("lancamentos").onSnapshot({ includeMetadataChanges: true }, (snapshot) => {
    lancamentos = [];
    snapshot.forEach((doc) => {
        lancamentos.push({ idDoc: doc.id, ...doc.data() });
    });
    salvarERenderizar();
    registrarSincronizacao('despesas', snapshot.metadata?.fromCache);
}, erroSincronizacao('despesas'));

// Receitas
db.collection("receitas").onSnapshot({ includeMetadataChanges: true }, (snapshot) => {
    receitas = [];
    snapshot.forEach((doc) => {
        receitas.push({ idDoc: doc.id, ...doc.data() });
    });
    salvarERenderizar();
    registrarSincronizacao('receitas', snapshot.metadata?.fromCache);
}, erroSincronizacao('receitas'));

// Categorias Dinâmicas
db.collection("categorias").onSnapshot({ includeMetadataChanges: true }, (snapshot) => {
    categorias = [];
    snapshot.forEach((doc) => {
        categorias.push({ idDoc: doc.id, ...doc.data() });
    });

    if (snapshot.empty) {
        inicializarCategoriasPadraoSeVazio();
    } else {
        renderizarCategorias();
    }
    registrarSincronizacao('categorias', snapshot.metadata?.fromCache);
}, erroSincronizacao('categorias'));

async function inicializarCategoriasPadraoSeVazio() {
    if (restaurandoBackup) return;
    try {
        const atuais = await db.collection('categorias').limit(1).get();
        if (restaurandoBackup || !atuais.empty) return;
        const batch = db.batch();
        categoriasPadrao.forEach((nome, index) => {
            batch.set(db.collection('categorias').doc(`padrao-${String(index + 1).padStart(2, '0')}`), { nome });
        });
        await batch.commit();
    } catch (error) {
        console.error('Falha ao criar categorias padrão:', error);
    }
}

// ==========================================
// 3. GESTÃO DE CATEGORIAS
// ==========================================
function renderizarCategorias() {
    if (!selectCategoria) return;
    selectCategoria.innerHTML = '';
    categorias.sort((a, b) => a.nome.localeCompare(b.nome));

    categorias.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat.nome;
        option.textContent = cat.nome;
        selectCategoria.appendChild(option);
    });

    if (listaCatModal) {
        listaCatModal.innerHTML = '';
        categorias.forEach(cat => {
            const li = document.createElement('li');
            li.style.cssText = "display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; align-items: center;";
            const nome = document.createElement('span');
            nome.textContent = cat.nome;
            const botao = document.createElement('button');
            botao.type = 'button';
            botao.textContent = 'x';
            botao.setAttribute('aria-label', `Excluir categoria ${cat.nome}`);
            botao.style.cssText = 'background: #ef4444; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;';
            botao.addEventListener('click', () => excluirCategoria(cat.idDoc));
            li.append(nome, botao);
            listaCatModal.appendChild(li);
        });
    }
}

if (btnOpenModalCat) btnOpenModalCat.addEventListener('click', () => modalCat.style.display = 'flex');
if (btnCloseModalCat) btnCloseModalCat.addEventListener('click', () => modalCat.style.display = 'none');

if (formNovaCat) {
    formNovaCat.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = document.getElementById('input-nova-categoria');
        const nome = input.value.trim();
        if (nome) {
            if (categorias.some((cat) => cat.nome.trim().toLocaleLowerCase('pt-BR') === nome.toLocaleLowerCase('pt-BR'))) {
                alert('Essa categoria já existe.');
                return;
            }
            db.collection("categorias").add({ nome })
                .then(() => { input.value = ''; })
                .catch((error) => alert(`Não foi possível salvar a categoria: ${error.message}`));
        }
    });
}

function excluirCategoria(idDoc) {
    if (confirm('Deseja excluir esta categoria?')) {
        db.collection("categorias").doc(idDoc).delete()
            .catch((error) => alert(`Não foi possível excluir a categoria: ${error.message}`));
    }
}

// ==========================================
// 4. LÓGICA DE NEGÓCIO E LANÇAMENTOS
// ==========================================
function setMesAtualFiltro() {
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = String(hoje.getMonth() + 1).padStart(2, '0');
    filtroMesAno.value = `${ano}-${mes}`;
}
setMesAtualFiltro();

filtroMesAno.addEventListener('change', salvarERenderizar);
btnMesAtual.addEventListener('click', () => {
    setMesAtualFiltro();
    salvarERenderizar();
});

function calcularDivisao(valorTotal, valorBebidas, formaDivisao) {
    const totalCentavos = Math.round(valorTotal * 100);
    const bebidasCentavos = Math.round(valorBebidas * 100);
    const valorLiquido = totalCentavos - bebidasCentavos;
    let parteSil = 0;
    let parteCharles = 0;

    if (formaDivisao === 'MeioAMeio' || formaDivisao === 'Mercado') {
        const metadeSil = Math.floor(valorLiquido / 2);
        parteSil = metadeSil / 100;
        parteCharles = (valorLiquido - metadeSil + bebidasCentavos) / 100;
    } else if (formaDivisao === 'Sil') {
        parteSil = totalCentavos / 100;
        parteCharles = 0;
    } else if (formaDivisao === 'Charles') {
        parteSil = 0;
        parteCharles = totalCentavos / 100;
    }

    return { parteSil, parteCharles };
}

// Submit Lançamento
form.addEventListener('submit', (e) => {
    e.preventDefault();

    const dataInicialStr = document.getElementById('data').value;
    const descricaoOriginal = document.getElementById('descricao').value;
    const categoria = document.getElementById('categoria').value;
    const valorTotalCompra = parseFloat(document.getElementById('valor-total').value);
    const tipoParcelamento = document.getElementById('parcelas').value;
    const valorBebidasTotal = parseFloat(document.getElementById('valor-bebidas').value) || 0;
    const pagoPor = document.getElementById('pago-por').value;
    const formaDivisao = document.querySelector('input[name="divisao"]:checked').value;

    if (formaDivisao === 'Mercado' && valorBebidasTotal <= 0) {
        alert('Informe o valor de bebidas/outros para usar a divisão de mercado.');
        return;
    }

    if (!Number.isFinite(valorTotalCompra) || valorTotalCompra <= 0 || valorBebidasTotal < 0 || valorBebidasTotal > valorTotalCompra) {
        alert('Informe um valor total positivo e uma dedução entre R$ 0,00 e o valor total.');
        return;
    }

    const baseId = Date.now();
    const numRepeticoes = tipoParcelamento === 'recorrente' ? 12 : parseInt(tipoParcelamento);
    const parcelasCentavos = dividirCentavos(Math.round(valorTotalCompra * 100), numRepeticoes);
    const bebidasCentavos = dividirCentavos(Math.round(valorBebidasTotal * 100), numRepeticoes);
    const [anoInicial, mesInicial, diaInicial] = dataInicialStr.split('-').map(Number);

    const batch = db.batch();
    for (let i = 0; i < numRepeticoes; i++) {
        const primeiroDiaMes = new Date(anoInicial, mesInicial - 1 + i, 1);
        const ultimoDiaMes = new Date(primeiroDiaMes.getFullYear(), primeiroDiaMes.getMonth() + 1, 0).getDate();
        const dataParcela = new Date(primeiroDiaMes.getFullYear(), primeiroDiaMes.getMonth(), Math.min(diaInicial, ultimoDiaMes));

        const dataFormatada = `${dataParcela.getFullYear()}-${String(dataParcela.getMonth() + 1).padStart(2, '0')}-${String(dataParcela.getDate()).padStart(2, '0')}`;
        let descFinal = descricaoOriginal;
        if (tipoParcelamento === 'recorrente') {
            descFinal = `${descricaoOriginal} 🔄`;
        } else if (numRepeticoes > 1) {
            descFinal = `${descricaoOriginal} (${i + 1}/${numRepeticoes})`;
        }

        const valorParcela = parcelasCentavos[i] / 100;
        const valorBebidaParcela = bebidasCentavos[i] / 100;
        const { parteSil, parteCharles } = calcularDivisao(valorParcela, valorBebidaParcela, formaDivisao);

        const docRef = db.collection('lancamentos').doc();
        batch.set(docRef, {
            id: baseId + i,
            grupoId: baseId,
            data: dataFormatada,
            descricao: descFinal,
            categoria,
            valorTotal: valorParcela,
            valorBebidas: valorBebidaParcela,
            pagoPor,
            formaDivisao,
            parteSil,
            parteCharles,
            isRecorrente: tipoParcelamento === 'recorrente'
        });
    }

    batch.commit().then(() => {
        form.reset();
        document.getElementById('data').valueAsDate = new Date();
    }).catch((error) => alert(`Não foi possível salvar o lançamento: ${error.message}`));
});

if (formEntradaExtra) {
    formEntradaExtra.addEventListener('submit', (e) => {
        e.preventDefault();
        const valor = Number(document.getElementById('extra-valor').value);
        if (!Number.isFinite(valor) || valor <= 0) return alert('Informe um valor positivo para a entrada.');
        db.collection('receitas').add({
            tipo: 'Entrada extra',
            pessoa: document.getElementById('extra-pessoa').value,
            descricao: document.getElementById('extra-descricao').value.trim(),
            total: arredondarMoeda(valor),
            salario: 0,
            outros: arredondarMoeda(valor),
            mesAno: filtroMesAno.value,
            dataRegistro: new Date().toISOString()
        }).then(() => formEntradaExtra.reset()).catch((error) => alert(`Não foi possível salvar a entrada: ${error.message}`));
    });
}

function arredondarMoeda(valor) { return Math.round((valor + Number.EPSILON) * 100) / 100; }

function dividirCentavos(total, quantidade) {
    const base = Math.floor(total / quantidade);
    const resto = total % quantidade;
    return Array.from({ length: quantidade }, (_, i) => base + (i < resto ? 1 : 0));
}

function excluirLancamento(idDoc) {
    const lancamento = lancamentos.find((item) => item.idDoc === idDoc);
    if (!lancamento) return;
    if (!lancamento.grupoId) {
        if (confirm('Deseja realmente excluir este lançamento?')) db.collection('lancamentos').doc(idDoc).delete();
        return;
    }
    const grupo = lancamentos.filter((item) => item.grupoId === lancamento.grupoId);
    let excluirGrupo = false;
    if (grupo.length > 1) {
        excluirGrupo = confirm('Deseja excluir todas as parcelas deste lançamento?');
        if (!excluirGrupo && !confirm('Excluir somente esta parcela?')) return;
    } else if (!confirm('Deseja realmente excluir este lançamento?')) return;
    const refs = (excluirGrupo ? grupo : [lancamento]).map((item) => db.collection('lancamentos').doc(item.idDoc));
    const batch = db.batch();
    refs.forEach((ref) => batch.delete(ref));
    batch.commit().catch((error) => alert(`Não foi possível excluir o lançamento: ${error.message}`));
}

function calcularAcerto(pagoPorSil, pagoPorCharles, devidoSil, devidoCharles) {
    let saldoSil = pagoPorSil - devidoSil;
    let saldoCharles = pagoPorCharles - devidoCharles;

    const divAcerto = document.getElementById('resultado-acerto');

    if (saldoSil === 0 && saldoCharles === 0) {
        divAcerto.innerHTML = ' As contas estão totalmente equilibradas!';
    } else if (saldoSil < 0) {
        let valorDevido = Math.abs(saldoSil);
        divAcerto.innerHTML = `👩 <strong>Sil</strong> deve <strong>R$ ${valorDevido.toFixed(2)}</strong> para 👨 <strong>Charles</strong>.`;
    } else {
        let valorDevido = Math.abs(saldoCharles);
        divAcerto.innerHTML = `👨 <strong>Charles</strong> deve <strong>R$ ${valorDevido.toFixed(2)}</strong> para 👩 <strong>Sil</strong>.`;
    }
}

function renderizarGrafico(lancamentosFiltrados) {
    if (typeof Chart !== 'function') {
        console.error('Chart.js não carregou; tabela e resumos continuam disponíveis.');
        return;
    }
    const ctx = document.getElementById('grafico-categorias').getContext('2d');
    const categoriasTotais = {};

    lancamentosFiltrados.forEach(l => {
        const categoria = l.categoria || 'Sem categoria';
        const valor = Number(l.valorTotal) || 0;
        categoriasTotais[categoria] = (categoriasTotais[categoria] || 0) + valor;
    });

    if (meuGrafico) meuGrafico.destroy();

    meuGrafico = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(categoriasTotais),
            datasets: [{
                data: Object.values(categoriasTotais),
                backgroundColor: ['#2563eb', '#ec4899', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#64748b', '#ef4444']
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'bottom' },
                title: { display: true, text: 'Gastos por Categoria (R$)' }
            }
        }
    });
}

function salvarERenderizar() {
    lancamentos.sort((a, b) => new Date(b.data) - new Date(a.data));
    tabelaBody.innerHTML = '';

    const mesAnoSelecionado = filtroMesAno.value;
    const lancamentosFiltrados = lancamentos.filter(l => l.data && l.data.startsWith(mesAnoSelecionado));

    let totalGeralCentavos = 0, totalDevidoSilCentavos = 0, totalDevidoCharlesCentavos = 0, totalPagoSilCentavos = 0, totalPagoCharlesCentavos = 0;

    lancamentosFiltrados.forEach(l => {
        const valorTotalCentavos = Math.round((Number(l.valorTotal) || 0) * 100);
        const parteSilCentavos = Math.round((Number(l.parteSil) || 0) * 100);
        const parteCharlesCentavos = Math.round((Number(l.parteCharles) || 0) * 100);
        const valorTotal = valorTotalCentavos / 100;
        const parteSil = parteSilCentavos / 100;
        const parteCharles = parteCharlesCentavos / 100;
        totalGeralCentavos += valorTotalCentavos;
        totalDevidoSilCentavos += parteSilCentavos;
        totalDevidoCharlesCentavos += parteCharlesCentavos;

        if (l.pagoPor === 'Sil') totalPagoSilCentavos += valorTotalCentavos;
        else if (l.pagoPor === 'Charles') totalPagoCharlesCentavos += valorTotalCentavos;

        const tr = document.createElement('tr');
        const valores = [
            l.data ? l.data.split('-').reverse().join('/') : '',
            l.descricao || '',
            l.categoria || '',
            l.pagoPor || '',
            `R$ ${valorTotal.toFixed(2)}`,
            `R$ ${parteSil.toFixed(2)}`,
            `R$ ${parteCharles.toFixed(2)}`
        ];
        valores.forEach((valor, index) => {
            const td = document.createElement('td');
            if (index === 3) {
                const strong = document.createElement('strong');
                strong.textContent = valor;
                td.appendChild(strong);
            } else td.textContent = valor;
            tr.appendChild(td);
        });
        const acoes = document.createElement('td');
        const excluir = document.createElement('button');
        excluir.type = 'button';
        excluir.className = 'btn-excluir';
        excluir.textContent = 'x';
        excluir.setAttribute('aria-label', `Excluir lançamento ${l.descricao || ''}`);
        excluir.addEventListener('click', () => excluirLancamento(l.idDoc));
        acoes.appendChild(excluir);
        tr.appendChild(acoes);
        tabelaBody.appendChild(tr);
    });

    const totalGeral = totalGeralCentavos / 100;
    const totalDevidoSil = totalDevidoSilCentavos / 100;
    const totalDevidoCharles = totalDevidoCharlesCentavos / 100;
    const totalPagoSil = totalPagoSilCentavos / 100;
    const totalPagoCharles = totalPagoCharlesCentavos / 100;

    document.getElementById('resumo-total').innerText = `R$ ${totalGeral.toFixed(2)}`;
    document.getElementById('resumo-sil').innerText = `R$ ${totalDevidoSil.toFixed(2)}`;
    document.getElementById('resumo-charles').innerText = `R$ ${totalDevidoCharles.toFixed(2)}`;

    // Resumo da Receita / Sobra
    const divResumoReceitas = document.getElementById('resumo-receitas-mes');
    if (divResumoReceitas) {
        const receitasMes = receitas.filter(r => r.mesAno === mesAnoSelecionado);
        let totalEntradas = 0;
        let detalheReceitas = '';

        receitasMes.forEach(r => { totalEntradas += Number(r.total ?? r.salarioLiquido ?? ((Number(r.salario) || 0) + (Number(r.outros) || 0))) || 0; });

        let sobraGeral = totalEntradas - totalGeral;
        const painel = document.createElement('div');
        painel.style.cssText = 'background: #e0f2fe; padding: 12px; border-radius: 6px; border-left: 4px solid #0284c7;';
        const entrada = document.createElement('span');
        entrada.append('Entradas do Mês: ');
        const totalEntrada = document.createElement('strong');
        totalEntrada.textContent = `R$ ${totalEntradas.toFixed(2)}`;
        entrada.append(totalEntrada, ` (${receitasMes.length ? receitasMes.map((r) => `${r.pessoa || 'Pessoa'}: R$ ${(Number(r.total ?? r.salarioLiquido ?? ((Number(r.salario) || 0) + (Number(r.outros) || 0))) || 0).toFixed(2)}`).join(' | ') : 'Nenhuma cadastrada'})`);
        painel.append(entrada, document.createElement('br'));
        const saldo = document.createElement('span');
        saldo.style.fontSize = '1.05rem';
        saldo.append('Saldo Sobrando: ');
        const saldoValor = document.createElement('strong');
        saldoValor.style.color = sobraGeral >= 0 ? '#047857' : '#dc2626';
        saldoValor.textContent = `R$ ${sobraGeral.toFixed(2)}`;
        saldo.appendChild(saldoValor);
        painel.appendChild(saldo);
        divResumoReceitas.replaceChildren(painel);
    }

    if (lancamentosFiltrados.length > 0) {
        calcularAcerto(totalPagoSil, totalPagoCharles, totalDevidoSil, totalDevidoCharles);
    } else {
        document.getElementById('resultado-acerto').innerText = 'Nenhum lançamento neste mês.';
    }
    renderizarGrafico(lancamentosFiltrados);
    renderizarBotoesProjecao();
}

function renderizarBotoesProjecao() {
    const containerBotoes = document.getElementById('botoes-projecao');
    if (!containerBotoes) return;
    containerBotoes.innerHTML = '';
    const hoje = new Date();

    for (let i = 0; i < 6; i++) {
        let d = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1);
        let ano = d.getFullYear();
        let mes = String(d.getMonth() + 1).padStart(2, '0');
        let valorMesAno = `${ano}-${mes}`;

        let nomeMes = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
        nomeMes = nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1);

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `btn-projecao-mes ${filtroMesAno.value === valorMesAno ? 'ativo' : ''}`;
        btn.innerText = nomeMes;
        btn.addEventListener('click', () => {
            filtroMesAno.value = valorMesAno;
            salvarERenderizar();
        });
        containerBotoes.appendChild(btn);
    }
}

if (btnExportar) btnExportar.addEventListener('click', exportarCSV);

function exportarCSV() {
    const mesAnoSelecionado = filtroMesAno.value;
    const lancamentosFiltrados = lancamentos.filter(l => l.data && l.data.startsWith(mesAnoSelecionado));

    if (lancamentosFiltrados.length === 0) {
        alert('Nenhum lançamento no mês para exportar!');
        return;
    }

    const escaparCSV = (valor) => `"${String(valor ?? '').replace(/"/g, '""')}"`;
    const linhas = [['Data', 'Descricao', 'Categoria', 'Quem Pagou', 'Valor Total', 'Parte Sil', 'Parte Charles']];
    lancamentosFiltrados.forEach(l => {
        linhas.push([l.data, l.descricao, l.categoria, l.pagoPor, Number(l.valorTotal || 0).toFixed(2), Number(l.parteSil || 0).toFixed(2), Number(l.parteCharles || 0).toFixed(2)]);
    });

    const csvContent = '\uFEFF' + linhas.map((linha) => linha.map(escaparCSV).join(';')).join('\r\n');
    const encodedUri = URL.createObjectURL(new Blob([csvContent], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Gastos_${mesAnoSelecionado}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(encodedUri), 1000);
}

// Alternar abas: Holerite vs Entrada Extra
const tabBtnHolerite = document.getElementById('tab-btn-holerite');
const tabBtnExtra = document.getElementById('tab-btn-extra');
const formularioHolerite = document.getElementById('form-holerite');

if (tabBtnHolerite && tabBtnExtra && formularioHolerite && formEntradaExtra) {
    tabBtnHolerite.addEventListener('click', () => {
        formularioHolerite.style.display = '';
        formEntradaExtra.style.display = 'none';
        tabBtnHolerite.style.background = '#0284c7';
        tabBtnHolerite.style.color = 'white';
        tabBtnExtra.style.background = '#e2e8f0';
        tabBtnExtra.style.color = '#334155';
    });

    tabBtnExtra.addEventListener('click', () => {
        formularioHolerite.style.display = 'none';
        formEntradaExtra.style.display = '';
        tabBtnExtra.style.background = '#0284c7';
        tabBtnExtra.style.color = 'white';
        tabBtnHolerite.style.background = '#e2e8f0';
        tabBtnHolerite.style.color = '#334155';
    });
}
// ==========================================
// BOTOES DO RODAPÉ (BACKUP, RESTAURAR E LIMPAR)
// ==========================================
const colecoesBackup = ['lancamentos', 'receitas', 'categorias'];
if (btnExportarJson) btnExportarJson.addEventListener('click', exportarBackupCompleto);
if (inputImportarJson) inputImportarJson.addEventListener('change', importarBackupCompleto);
if (btnLimparTudo) btnLimparTudo.addEventListener('click', limparDadosDoAplicativo);

async function exportarBackupCompleto() {
    try {
        const colecoes = {};
        for (const nome of colecoesBackup) {
            const snapshot = await db.collection(nome).get();
            colecoes[nome] = snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() }));
        }
        const backup = {
            formato: 'controle-gastos-casa',
            versao: 1,
            exportadoEm: new Date().toISOString(),
            colecoes
        };
        const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = `Backup_GastosCasa_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
        alert(`Não foi possível exportar o backup: ${error.message}`);
    }
}

async function importarBackupCompleto(event) {
    const arquivo = event.target.files?.[0];
    if (!arquivo) return;
    let iniciouRestauração = false;
    try {
        if (arquivo.size > 20 * 1024 * 1024) throw new Error('O arquivo ultrapassa o limite de 20 MB.');
        const conteudo = JSON.parse(await arquivo.text());

        // Compatibilidade com o formato antigo, que continha apenas um array de despesas.
        if (Array.isArray(conteudo)) {
            if (conteudo.length > 10000) throw new Error('O backup contém mais de 10.000 lançamentos.');
            if (!confirm(`Este é um backup antigo com ${conteudo.length} lançamentos. Eles serão mesclados com os dados atuais; registros com o mesmo ID serão atualizados. Continuar?`)) return;
            const gravacoes = conteudo.map((item) => {
                if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('O arquivo contém um lançamento inválido.');
                const dados = { ...item };
                const id = typeof dados.idDoc === 'string' && dados.idDoc.trim() ? dados.idDoc : null;
                delete dados.idDoc;
                return { tipo: 'set', ref: id ? db.collection('lancamentos').doc(id) : db.collection('lancamentos').doc(), data: dados };
            });
            await gravarEmLotes(gravacoes);
            alert('Lançamentos do backup antigo importados. Receitas e categorias existentes foram preservadas.');
            return;
        }

        if (conteudo?.formato !== 'controle-gastos-casa' || !conteudo.colecoes || typeof conteudo.colecoes !== 'object') {
            throw new Error('O arquivo não corresponde a um backup completo deste aplicativo.');
        }

        const registros = {};
        let quantidade = 0;
        for (const nome of colecoesBackup) {
            const itens = conteudo.colecoes[nome];
            if (!Array.isArray(itens)) throw new Error(`A lista de ${nome} está ausente ou inválida.`);
            registros[nome] = itens.map((item) => {
                if (!item || typeof item !== 'object' || !item.data || typeof item.data !== 'object' || Array.isArray(item.data)) {
                    throw new Error(`Há um registro inválido em ${nome}.`);
                }
                if (item.id !== undefined && (typeof item.id !== 'string' || !item.id.trim() || item.id.includes('/'))) {
                    throw new Error(`Há um identificador inválido em ${nome}.`);
                }
                return item;
            });
            quantidade += registros[nome].length;
        }
        if (quantidade > 10000) throw new Error('O backup ultrapassa o limite de 10.000 registros.');
        if (!confirm(`A restauração substituirá receitas, lançamentos e categorias atuais por ${quantidade} registros deste arquivo. Recomendo exportar um backup atual antes. Deseja continuar?`)) return;

        restaurandoBackup = true;
        iniciouRestauração = true;
        for (const nome of colecoesBackup) {
            const atual = await db.collection(nome).get();
            await gravarEmLotes(atual.docs.map((doc) => ({ tipo: 'delete', ref: doc.ref })));
            const gravacoes = registros[nome].map((item) => ({
                tipo: 'set',
                ref: item.id ? db.collection(nome).doc(item.id) : db.collection(nome).doc(),
                data: item.data
            }));
            await gravarEmLotes(gravacoes);
        }
        alert('Backup completo restaurado.');
    } catch (error) {
        alert(`Não foi possível concluir a importação: ${error.message}`);
    } finally {
        if (iniciouRestauração) {
            restaurandoBackup = false;
            await inicializarCategoriasPadraoSeVazio();
        }
        inputImportarJson.value = '';
    }
}

async function limparDadosDoAplicativo() {
    if (!confirm('Isso apagará permanentemente despesas, receitas e categorias personalizadas da nuvem. As categorias padrão serão recriadas. Deseja continuar?')) return;
    try {
        for (const nome of colecoesBackup) {
            const snapshot = await db.collection(nome).get();
            await gravarEmLotes(snapshot.docs.map((doc) => ({ tipo: 'delete', ref: doc.ref })));
        }
        await inicializarCategoriasPadraoSeVazio();
        alert('Dados excluídos. As categorias padrão estão disponíveis novamente.');
    } catch (error) {
        alert(`Não foi possível limpar os dados: ${error.message}`);
    }
}

async function gravarEmLotes(operacoes) {
    for (let inicio = 0; inicio < operacoes.length; inicio += 450) {
        const lote = db.batch();
        operacoes.slice(inicio, inicio + 450).forEach((operacao) => {
            if (operacao.tipo === 'delete') lote.delete(operacao.ref);
            else lote.set(operacao.ref, operacao.data);
        });
        await lote.commit();
    }
}

// ==========================================
// MÓDULO DE HOLERITE (PROVENTOS & DESCONTOS)
// ==========================================
const containerProventos = document.getElementById('lista-proventos-container');
const btnAddProvento = document.getElementById('btn-add-provento');

const containerDescontos = document.getElementById('lista-descontos-container');
const btnAddDesconto = document.getElementById('btn-add-desconto');

const spanTotalProventos = document.getElementById('preview-total-proventos');
const spanTotalDescontos = document.getElementById('preview-total-descontos');
const spanLiquidoPreview = document.getElementById('holerite-liquido-preview');

// 1. Adicionar nova linha de Provento
if (btnAddProvento) {
    btnAddProvento.addEventListener('click', () => {
        const novaLinha = document.createElement('div');
        novaLinha.className = 'linha-provento';
        novaLinha.style.cssText = 'display: flex; gap: 8px;';
        novaLinha.innerHTML = `
            <input type="text" class="prov-nome" placeholder="Especificação (ex: Horas Extras)" style="flex: 2;">
            <input type="number" min="0" step="0.01" class="prov-valor" placeholder="Valor (R$)" style="flex: 1;">
            <button type="button" class="btn-remover-provento" style="background: #ef4444; color: white; border: none; border-radius: 4px; padding: 0 10px; cursor: pointer;">x</button>
        `;
        containerProventos.appendChild(novaLinha);
        adicionarListenersHolerite();
    });
}

// 2. Adicionar nova linha de Desconto
if (btnAddDesconto) {
    btnAddDesconto.addEventListener('click', () => {
        const novaLinha = document.createElement('div');
        novaLinha.className = 'linha-desconto';
        novaLinha.style.cssText = 'display: flex; gap: 8px;';
        novaLinha.innerHTML = `
            <input type="text" class="desc-nome" placeholder="Especificação (ex: INSS, Unimed)" style="flex: 2;">
            <input type="number" min="0" step="0.01" class="desc-valor" placeholder="Valor (R$)" style="flex: 1;">
            <button type="button" class="btn-remover-desconto" style="background: #ef4444; color: white; border: none; border-radius: 4px; padding: 0 10px; cursor: pointer;">x</button>
        `;
        containerDescontos.appendChild(novaLinha);
        adicionarListenersHolerite();
    });
}

// 3. Atualizar Listeners de remoção e recálculo
function adicionarListenersHolerite() {
    document.querySelectorAll('.btn-remover-provento').forEach(btn => {
        btn.onclick = (e) => {
            if (document.querySelectorAll('.linha-provento').length > 1) {
                e.target.parentElement.remove();
                calcularHolerite();
            }
        };
    });

    document.querySelectorAll('.btn-remover-desconto').forEach(btn => {
        btn.onclick = (e) => {
            if (document.querySelectorAll('.linha-desconto').length > 1) {
                e.target.parentElement.remove();
                calcularHolerite();
            }
        };
    });

    document.querySelectorAll('.prov-valor, .desc-valor').forEach(input => {
        input.oninput = calcularHolerite;
    });
}
adicionarListenersHolerite();

// 4. Calcular Valores e Mostrar na Tela
function calcularHolerite() {
    let totalProventosCentavos = 0;
    let totalDescontosCentavos = 0;

    document.querySelectorAll('.prov-valor').forEach(input => {
        totalProventosCentavos += Math.round((Number(input.value) || 0) * 100);
    });

    document.querySelectorAll('.desc-valor').forEach(input => {
        totalDescontosCentavos += Math.round((Number(input.value) || 0) * 100);
    });

    const totalProventos = totalProventosCentavos / 100;
    const totalDescontos = totalDescontosCentavos / 100;
    const liquido = totalProventos - totalDescontos;

    if (spanTotalProventos) spanTotalProventos.textContent = `R$ ${totalProventos.toFixed(2)}`;
    if (spanTotalDescontos) spanTotalDescontos.textContent = `R$ ${totalDescontos.toFixed(2)}`;
    if (spanLiquidoPreview) spanLiquidoPreview.textContent = `R$ ${liquido.toFixed(2)}`;

    return { totalProventos, totalDescontos, liquido };
}

// 5. Submit da Folha do Mês no Firebase
if (formularioHolerite) {
    formularioHolerite.addEventListener('submit', (e) => {
        e.preventDefault();
        const pessoa = document.getElementById('holerite-pessoa').value;
        const { totalProventos, totalDescontos, liquido } = calcularHolerite();
        const mesAno = filtroMesAno.value;
        if (totalProventos <= 0 || totalDescontos > totalProventos) {
            alert('Confira os valores: os proventos devem ser positivos e não podem ser menores que os descontos.');
            return;
        }

        // Captura a lista individual de Proventos
        const proventosDetalhado = [];
        let descricaoProventoAusente = false;
        document.querySelectorAll('.linha-provento').forEach(linha => {
            const nome = linha.querySelector('.prov-nome').value.trim();
            const valor = Number(linha.querySelector('.prov-valor').value) || 0;
            if (valor > 0 && !nome) descricaoProventoAusente = true;
            if (nome && valor > 0) proventosDetalhado.push({ nome, valor: arredondarMoeda(valor) });
        });

        // Captura a lista individual de Descontos
        const descontosDetalhado = [];
        let descricaoDescontoAusente = false;
        document.querySelectorAll('.linha-desconto').forEach(linha => {
            const nome = linha.querySelector('.desc-nome').value.trim();
            const valor = Number(linha.querySelector('.desc-valor').value) || 0;
            if (valor > 0 && !nome) descricaoDescontoAusente = true;
            if (nome && valor > 0) descontosDetalhado.push({ nome, valor: arredondarMoeda(valor) });
        });
        if (descricaoProventoAusente || descricaoDescontoAusente) {
            alert('Preencha a descrição de cada provento ou desconto que tenha valor.');
            return;
        }

        db.collection("receitas").add({
            tipo: "Holerite",
            pessoa,
            proventos: proventosDetalhado,
            totalProventos,
            descontos: descontosDetalhado,
            totalDescontos,
            salarioLiquido: liquido,
            total: liquido,
            mesAno,
            dataRegistro: new Date().toISOString()
        }).then(() => {
            formularioHolerite.reset();
            calcularHolerite();
            alert('Folha de pagamento cadastrada com sucesso!');
        }).catch((error) => alert(`Não foi possível salvar a folha: ${error.message}`));
    });
}
