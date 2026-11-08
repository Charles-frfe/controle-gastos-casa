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

const categoriasPadrao = [
    "🛒 Mercado", "🐱 Gatas", "💊 Farmácia", "🚗 Uber / Transportes", 
    "🎉 Extra / Lazer", "💡 Água + Luz", "🌐 Internet", "📱 Vivo / Telefonia", 
    "🚘 Carro", "📺 Streamings", "🏠 Invest. Cons. Casa", 
    "🚗 Invest. Cons. Carro", "🛡️ Reserva"
];

// Preenche a data de hoje
document.getElementById('data').valueAsDate = new Date();

const form = document.getElementById('form-gastos');
const formReceita = document.getElementById('form-receita');
const tabelaBody = document.getElementById('tabela-gastos-body');
const filtroMesAno = document.getElementById('filtro-mes-ano');
const btnMesAtual = document.getElementById('btn-mes-atual');
const btnExportar = document.getElementById('btn-exportar');

const selectCategoria = document.getElementById('categoria');
const modalCat = document.getElementById('modal-categorias');
const btnOpenModalCat = document.getElementById('btn-modal-categoria');
const btnCloseModalCat = document.getElementById('btn-fechar-modal-cat');
const formNovaCat = document.getElementById('form-nova-categoria');
const listaCatModal = document.getElementById('lista-categorias-modal');

// ==========================================
// 2. ESCUTAS EM TEMPO REAL (FIREBASE)
// ==========================================

// Lançamentos
db.collection("lancamentos").onSnapshot((snapshot) => {
    lancamentos = [];
    snapshot.forEach((doc) => {
        lancamentos.push({ idDoc: doc.id, ...doc.data() });
    });
    salvarERenderizar();
});

// Receitas
db.collection("receitas").onSnapshot((snapshot) => {
    receitas = [];
    snapshot.forEach((doc) => {
        receitas.push({ idDoc: doc.id, ...doc.data() });
    });
    salvarERenderizar();
});

// Categorias Dinâmicas
db.collection("categorias").onSnapshot((snapshot) => {
    categorias = [];
    snapshot.forEach((doc) => {
        categorias.push({ idDoc: doc.id, ...doc.data() });
    });

    if (snapshot.empty) {
        categoriasPadrao.forEach(nome => {
            db.collection("categorias").add({ nome });
        });
    } else {
        renderizarCategorias();
    }
});

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
            li.innerHTML = `
                <span>${cat.nome}</span>
                <button onclick="excluirCategoria('${cat.idDoc}')" style="background: #ef4444; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;">x</button>
            `;
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
            db.collection("categorias").add({ nome });
            input.value = '';
        }
    });
}

function excluirCategoria(idDoc) {
    if (confirm('Deseja excluir esta categoria?')) {
        db.collection("categorias").doc(idDoc).delete();
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
    let valorLiquido = valorTotal - valorBebidas;
    let parteSil = 0;
    let parteCharles = 0;

    if (formaDivisao === 'MeioAMeio') {
        let metade = valorLiquido / 2;
        parteSil = metade;
        parteCharles = metade + valorBebidas;
    } else if (formaDivisao === 'Sil') {
        parteSil = valorTotal;
        parteCharles = 0;
    } else if (formaDivisao === 'Charles') {
        parteSil = 0;
        parteCharles = valorTotal;
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

    const baseId = Date.now();
    const numRepeticoes = tipoParcelamento === 'recorrente' ? 12 : parseInt(tipoParcelamento);
    const valorParcela = tipoParcelamento === 'recorrente' ? valorTotalCompra : (valorTotalCompra / numRepeticoes);
    const valorBebidaParcela = tipoParcelamento === 'recorrente' ? valorBebidasTotal : (valorBebidasTotal / numRepeticoes);

    for (let i = 0; i < numRepeticoes; i++) {
        let dataParcela = new Date(dataInicialStr + 'T00:00:00');
        dataParcela.setMonth(dataParcela.getMonth() + i);

        let dataFormatada = dataParcela.toISOString().split('T')[0];
        let descFinal = descricaoOriginal;
        if (tipoParcelamento === 'recorrente') {
            descFinal = `${descricaoOriginal} 🔄`;
        } else if (numRepeticoes > 1) {
            descFinal = `${descricaoOriginal} (${i + 1}/${numRepeticoes})`;
        }

        const { parteSil, parteCharles } = calcularDivisao(valorParcela, valorBebidaParcela, formaDivisao);

        db.collection("lancamentos").add({
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

    form.reset();
    document.getElementById('data').valueAsDate = new Date();
});

// Submit Receita
if (formReceita) {
    formReceita.addEventListener('submit', (e) => {
        e.preventDefault();
        const pessoa = document.getElementById('receita-pessoa').value;
        const salario = parseFloat(document.getElementById('receita-salario').value) || 0;
        const outros = parseFloat(document.getElementById('receita-outros').value) || 0;
        const mesAno = filtroMesAno.value;

        db.collection("receitas").add({
            pessoa,
            salario,
            outros,
            total: salario + outros,
            mesAno
        });

        formReceita.reset();
    });
}

function excluirLancamento(idDoc) {
    if (confirm('Deseja realmente excluir este lançamento?')) {
        db.collection("lancamentos").doc(idDoc).delete();
    }
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
    const ctx = document.getElementById('grafico-categorias').getContext('2d');
    const categoriasTotais = {};

    lancamentosFiltrados.forEach(l => {
        categoriasTotais[l.categoria] = (categoriasTotais[l.categoria] || 0) + l.valorTotal;
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

    let totalGeral = 0, totalDevidoSil = 0, totalDevidoCharles = 0, totalPagoSil = 0, totalPagoCharles = 0;

    lancamentosFiltrados.forEach(l => {
        totalGeral += l.valorTotal;
        totalDevidoSil += l.parteSil;
        totalDevidoCharles += l.parteCharles;

        if (l.pagoPor === 'Sil') totalPagoSil += l.valorTotal;
        else if (l.pagoPor === 'Charles') totalPagoCharles += l.valorTotal;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${l.data.split('-').reverse().join('/')}</td>
            <td>${l.descricao}</td>
            <td>${l.categoria}</td>
            <td><strong>${l.pagoPor}</strong></td>
            <td>R$ ${l.valorTotal.toFixed(2)}</td>
            <td>R$ ${l.parteSil.toFixed(2)}</td>
            <td>R$ ${l.parteCharles.toFixed(2)}</td>
            <td><button class="btn-excluir" onclick="excluirLancamento('${l.idDoc}')">x</button></td>
        `;
        tabelaBody.appendChild(tr);
    });

    document.getElementById('resumo-total').innerText = `R$ ${totalGeral.toFixed(2)}`;
    document.getElementById('resumo-sil').innerText = `R$ ${totalDevidoSil.toFixed(2)}`;
    document.getElementById('resumo-charles').innerText = `R$ ${totalDevidoCharles.toFixed(2)}`;

    // Resumo da Receita / Sobra
    const divResumoReceitas = document.getElementById('resumo-receitas-mes');
    if (divResumoReceitas) {
        const receitasMes = receitas.filter(r => r.mesAno === mesAnoSelecionado);
        let totalEntradas = 0;
        let detalheReceitas = '';

        receitasMes.forEach(r => {
            totalEntradas += r.total;
            detalheReceitas += `${r.pessoa}: R$ ${r.total.toFixed(2)} | `;
        });

        let sobraGeral = totalEntradas - totalGeral;

        divResumoReceitas.innerHTML = `
            <div style="background: #e0f2fe; padding: 12px; border-radius: 6px; border-left: 4px solid #0284c7;">
                <span>Entradas do Mês: <strong>R$ ${totalEntradas.toFixed(2)}</strong> (${detalheReceitas ? detalheReceitas.slice(0, -3) : 'Nenhuma cadastrada'})</span><br>
                <span style="font-size: 1.05rem;">Saldo Sobrando: <strong style="color: ${sobraGeral >= 0 ? '#047857' : '#dc2626'}">R$ ${sobraGeral.toFixed(2)}</strong></span>
            </div>
        `;
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
    const lancamentosFiltrados = lancamentos.filter(l => l.data.startsWith(mesAnoSelecionado));

    if (lancamentosFiltrados.length === 0) {
        alert('Nenhum lançamento no mês para exportar!');
        return;
    }

    let csvContent = "data:text/csv;charset=utf-8,Data;Descricao;Categoria;Quem Pagou;Valor Total;Parte Sil;Parte Charles\n";
    lancamentosFiltrados.forEach(l => {
        csvContent += `${l.data};"${l.descricao}";${l.categoria};${l.pagoPor};${l.valorTotal.toFixed(2)};${l.parteSil.toFixed(2)};${l.parteCharles.toFixed(2)}\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Gastos_${mesAnoSelecionado}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// ==========================================
// MÓDULO DE HOLERITE E ENTRADAS EXTRAS
// ==========================================
const tabBtnHolerite = document.getElementById('tab-btn-holerite');
const tabBtnExtra = document.getElementById('tab-btn-extra');
const formHolerite = document.getElementById('form-holerite');
const formEntradaExtra = document.getElementById('form-entrada-extra');

const inputBruto = document.getElementById('holerite-bruto');
const containerDescontos = document.getElementById('lista-descontos-container');
const btnAddDesconto = document.getElementById('btn-add-desconto');
const spanLiquidoPreview = document.getElementById('holerite-liquido-preview');

// Alternar entre Holerite e Entradas Extras
if (tabBtnHolerite && tabBtnExtra) {
    tabBtnHolerite.addEventListener('click', () => {
        formHolerite.style.display = 'block';
        formEntradaExtra.style.display = 'none';
        tabBtnHolerite.style.background = '#0284c7';
        tabBtnHolerite.style.color = 'white';
        tabBtnExtra.style.background = '#e2e8f0';
        tabBtnExtra.style.color = '#334155';
    });

    tabBtnExtra.addEventListener('click', () => {
        formHolerite.style.display = 'none';
        formEntradaExtra.style.display = 'flex';
        tabBtnExtra.style.background = '#0284c7';
        tabBtnExtra.style.color = 'white';
        tabBtnHolerite.style.background = '#e2e8f0';
        tabBtnHolerite.style.color = '#334155';
    });
}

// Adicionar nova linha de desconto
if (btnAddDesconto) {
    btnAddDesconto.addEventListener('click', () => {
        const novaLinha = document.createElement('div');
        novaLinha.className = 'linha-desconto';
        novaLinha.style.cssText = 'display: flex; gap: 8px;';
        novaLinha.innerHTML = `
            <input type="text" class="desc-nome" placeholder="Especificação" style="flex: 2;">
            <input type="number" step="0.01" class="desc-valor" placeholder="Valor (R$)" style="flex: 1;">
            <button type="button" class="btn-remover-desconto" style="background: #ef4444; color: white; border: none; border-radius: 4px; padding: 0 10px; cursor: pointer;">x</button>
        `;
        containerDescontos.appendChild(novaLinha);
        adicionarListenersDescontos();
    });
}

// Remover linha de desconto e recadastrar listeners de cálculo
function adicionarListenersDescontos() {
    document.querySelectorAll('.btn-remover-desconto').forEach(btn => {
        btn.onclick = (e) => {
            if (document.querySelectorAll('.linha-desconto').length > 1) {
                e.target.parentElement.remove();
                calcularLiquidoHolerite();
            }
        };
    });

    document.querySelectorAll('.desc-valor').forEach(input => {
        input.oninput = calcularLiquidoHolerite;
    });
}
adicionarListenersDescontos();

if (inputBruto) inputBruto.oninput = calcularLiquidoHolerite;

// Calcular Líquido em Tempo Real
function calcularLiquidoHolerite() {
    const bruto = parseFloat(inputBruto.value) || 0;
    let totalDescontos = 0;

    document.querySelectorAll('.desc-valor').forEach(input => {
        totalDescontos += parseFloat(input.value) || 0;
    });

    const liquido = bruto - totalDescontos;
    if (spanLiquidoPreview) {
        spanLiquidoPreview.textContent = `R$ ${liquido.toFixed(2)}`;
    }
    return { bruto, totalDescontos, liquido };
}

// Submit do Holerite Detalhado
if (formHolerite) {
    formHolerite.addEventListener('submit', (e) => {
        e.preventDefault();
        const pessoa = document.getElementById('holerite-pessoa').value;
        const { bruto, totalDescontos, liquido } = calcularLiquidoHolerite();
        const mesAno = filtroMesAno.value;

        const descontosDetalhado = [];
        document.querySelectorAll('.linha-desconto').forEach(linha => {
            const nome = linha.querySelector('.desc-nome').value.trim();
            const valor = parseFloat(linha.querySelector('.desc-valor').value) || 0;
            if (nome && valor > 0) {
                descontosDetalhado.push({ nome, valor });
            }
        });

        db.collection("receitas").add({
            tipo: "Holerite",
            pessoa,
            salarioBruto: bruto,
            descontos: descontosDetalhado,
            totalDescontos,
            salarioLiquido: liquido,
            total: liquido,
            mesAno,
            dataRegistro: new Date().toISOString()
        });

        formHolerite.reset();
        calcularLiquidoHolerite();
    });
}

// Submit de Entrada Extra
if (formEntradaExtra) {
    formEntradaExtra.addEventListener('submit', (e) => {
        e.preventDefault();
        const pessoa = document.getElementById('extra-pessoa').value;
        const descricao = document.getElementById('extra-descricao').value;
        const valor = parseFloat(document.getElementById('extra-valor').value) || 0;
        const mesAno = filtroMesAno.value;

        db.collection("receitas").add({
            tipo: "Extra",
            pessoa,
            descricao,
            total: valor,
            mesAno,
            dataRegistro: new Date().toISOString()
        });

        formEntradaExtra.reset();
    });
}
