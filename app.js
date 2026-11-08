// ==========================================
// 1. CONFIGURAÇÃO E CONEXÃO COM O FIREBASE
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

// Inicializa o Firebase e o banco Firestore
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

let lancamentos = [];
let meuGrafico = null;

// ==========================================
// GERENCIADOR DE CATEGORIAS DINÂMICAS
// ==========================================
let categorias = [];
const categoriasPadrao = [
    "🛒 Mercado", "🐱 Gatas", "💊 Farmácia", "🚗 Uber / Transportes", 
    "🎉 Extra / Lazer", "💡 Água + Luz", "🌐 Internet", "📱 Vivo / Telefonia", 
    "🚘 Carro", "📺 Streamings", "🏠 Invest. Cons. Casa", 
    "🚗 Invest. Cons. Carro", "🛡️ Reserva"
];

const selectCategoria = document.getElementById('categoria');
const modalCat = document.getElementById('modal-categorias');
const btnOpenModalCat = document.getElementById('btn-modal-categoria');
const btnCloseModalCat = document.getElementById('btn-fechar-modal-cat');
const formNovaCat = document.getElementById('form-nova-categoria');
const listaCatModal = document.getElementById('lista-categorias-modal');

// Escuta a coleção de categorias no Firebase
db.collection("categorias").onSnapshot((snapshot) => {
    categorias = [];
    snapshot.forEach((doc) => {
        categorias.push({ idDoc: doc.id, ...doc.data() });
    });

    // Se for a primeira execução e o banco estiver vazio, popula com as categorias padrão
    if (snapshot.empty) {
        categoriasPadrao.forEach(nome => {
            db.collection("categorias").add({ nome });
        });
    } else {
        renderizarCategorias();
    }
});

function renderizarCategorias() {
    if (!selectCategoria) return;

    // Atualiza o select do formulário
    selectCategoria.innerHTML = '';
    categorias.sort((a, b) => a.nome.localeCompare(b.nome));

    categorias.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat.nome;
        option.textContent = cat.nome;
        selectCategoria.appendChild(option);
    });

    // Atualiza a lista dentro da Modal
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

// Abrir/Fechar Modal
if (btnOpenModalCat) btnOpenModalCat.addEventListener('click', () => modalCat.style.display = 'flex');
if (btnCloseModalCat) btnCloseModalCat.addEventListener('click', () => modalCat.style.display = 'none');

// Adicionar Nova Categoria
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

// Excluir Categoria
function excluirCategoria(idDoc) {
    if (confirm('Deseja excluir esta categoria?')) {
        db.collection("categorias").doc(idDoc).delete();
    }
}
// ==========================================
// 2. ESCUTA EM TEMPO REAL (SINCRONIZAÇÃO NUVEM ↔ TELA)
// ==========================================
db.collection("lancamentos").onSnapshot((snapshot) => {
    lancamentos = [];
    snapshot.forEach((doc) => {
        lancamentos.push({ idDoc: doc.id, ...doc.data() });
    });
    salvarERenderizar();
});

// Preenche a data de hoje automaticamente no formulário
document.getElementById('data').valueAsDate = new Date();

const btnExportar = document.getElementById('btn-exportar');
btnExportar.addEventListener('click', exportarCSV);

const form = document.getElementById('form-gastos');
const tabelaBody = document.querySelector('#tabela-gastos tbody');
const filtroMesAno = document.getElementById('filtro-mes-ano');
const btnMesAtual = document.getElementById('btn-mes-atual');

// Definir o mês/ano atual no seletor (Formato: YYYY-MM)
function setMesAtualFiltro() {
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = String(hoje.getMonth() + 1).padStart(2, '0');
    filtroMesAno.value = `${ano}-${mes}`;
}

setMesAtualFiltro();

// Listeners de mudança no filtro
filtroMesAno.addEventListener('change', salvarERenderizar);
btnMesAtual.addEventListener('click', () => {
    setMesAtualFiltro();
    salvarERenderizar();
});

// Função de cálculo de rateio
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

// Salvar Lançamento (Com suporte a Parcelamento e Envio ao Firebase)
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

    // Se for recorrente, projeta para 12 meses
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

        const novoLancamento = {
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
        };

        // Salva direto no banco de dados na nuvem (Firebase)
        db.collection("lancamentos").add(novoLancamento);
    }

    form.reset();
    document.getElementById('data').valueAsDate = new Date();
});

// Excluir Lançamento na Nuvem
function excluirLancamento(idDoc) {
    if (confirm('Deseja realmente excluir este lançamento?')) {
        db.collection("lancamentos").doc(idDoc).delete();
    }
}

// Calcular Liquidação (Quem deve para quem)
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

    // Agrupa gastos por categoria
    const categoriasTotais = {};
    lancamentosFiltrados.forEach(l => {
        categoriasTotais[l.categoria] = (categoriasTotais[l.categoria] || 0) + l.valorTotal;
    });

    const labels = Object.keys(categoriasTotais);
    const data = Object.values(categoriasTotais);

    if (meuGrafico) {
        meuGrafico.destroy();
    }

    meuGrafico = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: [
                    '#2563eb', '#ec4899', '#10b981', '#f59e0b',
                    '#8b5cf6', '#06b6d4', '#64748b', '#ef4444'
                ]
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

// Função para exportar os dados do mês em CSV
function exportarCSV() {
    const mesAnoSelecionado = filtroMesAno.value;
    const lancamentosFiltrados = lancamentos.filter(l => l.data.startsWith(mesAnoSelecionado));

    if (lancamentosFiltrados.length === 0) {
        alert('Nenhum lançamento no mês para exportar!');
        return;
    }

    let csvContent = "data:text/csv;charset=utf-8,Data;Descricao;Categoria;Quem Pagou;Valor Total;Parte Sil;Parte Charles\n";

    lancamentosFiltrados.forEach(l => {
        const row = `${l.data};"${l.descricao}";${l.categoria};${l.pagoPor};${l.valorTotal.toFixed(2)};${l.parteSil.toFixed(2)};${l.parteCharles.toFixed(2)}`;
        csvContent += row + "\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Gastos_${mesAnoSelecionado}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Atualizar Tabela e Totais na Tela
function salvarERenderizar() {
    lancamentos.sort((a, b) => new Date(b.data) - new Date(a.data));
    tabelaBody.innerHTML = '';

    const mesAnoSelecionado = filtroMesAno.value;

    // Filtra os lançamentos pertencentes ao mês/ano selecionado
    const lancamentosFiltrados = lancamentos.filter(l => l.data && l.data.startsWith(mesAnoSelecionado));

    let totalGeral = 0;
    let totalDevidoSil = 0;
    let totalDevidoCharles = 0;
    let totalPagoSil = 0;
    let totalPagoCharles = 0;

    lancamentosFiltrados.forEach(l => {
        totalGeral += l.valorTotal;
        totalDevidoSil += l.parteSil;
        totalDevidoCharles += l.parteCharles;

        if (l.pagoPor === 'Sil') {
            totalPagoSil += l.valorTotal;
        } else if (l.pagoPor === 'Charles') {
            totalPagoCharles += l.valorTotal;
        }

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

const btnExportarJSON = document.getElementById('btn-exportar-json');
const inputImportarJSON = document.getElementById('input-importar-json');
const btnLimparTudo = document.getElementById('btn-limpar-tudo');

if (btnExportarJSON) {
    btnExportarJSON.addEventListener('click', () => {
        if (lancamentos.length === 0) {
            alert('Não há dados para exportar no backup.');
            return;
        }

        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(lancamentos, null, 2));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", `Backup_ControleGastos_${new Date().toISOString().split('T')[0]}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
    });
}

if (inputImportarJSON) {
    inputImportarJSON.addEventListener('change', (event) => {
        const fileReader = new FileReader();
        fileReader.onload = (e) => {
            try {
                const dadosImportados = JSON.parse(e.target.result);
                if (Array.isArray(dadosImportados)) {
                    if (confirm(`Deseja importar ${dadosImportados.length} lançamentos? Isso irá enviar todos os dados para o banco.`)) {
                        dadosImportados.forEach(item => {
                            db.collection("lancamentos").add(item);
                        });
                        alert('Backup importado com sucesso para a nuvem!');
                    }
                } else {
                    alert('Arquivo de backup inválido.');
                }
            } catch (err) {
                alert('Erro ao ler o arquivo JSON de backup.');
            }
        };
        if (event.target.files[0]) {
            fileReader.readAsText(event.target.files[0]);
        }
    });
}

if (btnLimparTudo) {
    btnLimparTudo.addEventListener('click', () => {
        if (confirm('⚠️ TEM CERTEZA? Esta ação apagará TODOS os lançamentos registrados no banco de dados da nuvem!')) {
            db.collection("lancamentos").get().then((snapshot) => {
                snapshot.forEach((doc) => {
                    doc.ref.delete();
                });
                alert('Todos os dados foram apagados da nuvem.');
            });
        }
    });
}