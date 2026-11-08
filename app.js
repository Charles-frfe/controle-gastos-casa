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
const GEMINI_API_KEY = "AQ.Ab8RN6J_ljhQCW7vo89HOE70Z96gTiRHM8I2EB-V12yec-GV2g"; // Pode utilizar a sua chave da API Gemini

const inputFotoOcr = document.getElementById('input-foto-ocr');
const modalOcr = document.getElementById('modal-ocr');
const btnFecharOcr = document.getElementById('btn-fechar-ocr');
const statusOcr = document.getElementById('status-processando-ocr');
const conteudoOcr = document.getElementById('conteudo-resultado-ocr');
const listaItensOcr = document.getElementById('lista-itens-ocr');
const btnConfirmarOcr = document.getElementById('btn-confirmar-ocr');

let itensExtraidosOcr = [];

if (btnFecharOcr) btnFecharOcr.addEventListener('click', () => modalOcr.style.display = 'none');

if (inputFotoOcr) {
    inputFotoOcr.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        modalOcr.style.display = 'flex';
        statusOcr.style.display = 'block';
        conteudoOcr.style.display = 'none';

        try {
            const base64Data = await converterArquivoParaBase64(file);
            const mimeType = file.type;

            const resultadoJson = await analisarComprovanteComGemini(base64Data, mimeType);
            itensExtraidosOcr = resultadoJson.itens || [];

            renderizarItensOcr(resultadoJson);

            statusOcr.style.display = 'none';
            conteudoOcr.style.display = 'block';
        } catch (err) {
            alert('Erro ao analisar o documento com a IA: ' + err.message);
            modalOcr.style.display = 'none';
        }
    });
}

function converterArquivoParaBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });
}

async function analisarComprovanteComGemini(base64Data, mimeType) {
    const prompt = `Analise este comprovante/nota fiscal/documento e retorne ESTRITAMENTE um objeto JSON válido (sem marcação de código markdown tipo \`\`\`json) com a seguinte estrutura:
    {
        "data": "YYYY-MM-DD",
        "descricaoGeral": "Nome do Estabelecimento ou Titulo do Holerite",
        "itens": [
            { "descricao": "Nome do Produto/Item", "valor": 0.00 }
        ]
    }`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    const payload = {
        contents: [{
            parts: [
                { text: prompt },
                { inline_data: { mime_type: mimeType, data: base64Data } }
            ]
        }]
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    const data = await response.json();
    const textoResposta = data.candidates[0].content.parts[0].text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(textoResposta);
}

function renderizarItensOcr(dados) {
    listaItensOcr.innerHTML = `
        <div style="margin-bottom: 10px; font-weight: bold; color: #1e293b;">
            📍 ${dados.descricaoGeral || 'Comprovante'} - ${dados.data || 'Data não identificada'}
        </div>
    `;

    dados.itens.forEach((item, index) => {
        const divItem = document.createElement('div');
        divItem.style.cssText = "display: flex; flex-direction: column; gap: 4px; padding: 10px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; margin-bottom: 8px;";
        divItem.innerHTML = `
            <div style="display: flex; justify-content: space-between; font-weight: 600;">
                <span>${item.descricao}</span>
                <span>R$ ${parseFloat(item.valor).toFixed(2)}</span>
            </div>
            <div style="display: flex; gap: 10px; font-size: 0.85rem; margin-top: 4px;">
                <label><input type="radio" name="divisao_ocr_${index}" value="MeioAMeio" checked> ⚖️ Meio a Meio</label>
                <label><input type="radio" name="divisao_ocr_${index}" value="Sil"> 👩 Sil</label>
                <label><input type="radio" name="divisao_ocr_${index}" value="Charles"> 👨 Charles</label>
            </div>
        `;
        listaItensOcr.appendChild(divItem);
    });
}

if (btnConfirmarOcr) {
    btnConfirmarOcr.addEventListener('click', () => {
        const hojeStr = document.getElementById('data').value || new Date().toISOString().split('T')[0];
        
        itensExtraidosOcr.forEach((item, index) => {
            const formaDivisao = document.querySelector(`input[name="divisao_ocr_${index}"]:checked`).value;
            const { parteSil, parteCharles } = calcularDivisao(item.valor, 0, formaDivisao);

            db.collection("lancamentos").add({
                id: Date.now() + index,
                data: hojeStr,
                descricao: item.descricao,
                categoria: "🛒 Mercado",
                valorTotal: item.valor,
                valorBebidas: 0,
                pagoPor: "Charles",
                formaDivisao,
                parteSil,
                parteCharles,
                isRecorrente: false
            });
        });

        modalOcr.style.display = 'none';
        alert('Lançamentos importados com sucesso!');
    });
}