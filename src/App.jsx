import { useEffect, useState } from 'react';
import { buscarEstoque, salvarEstoqueNaNuvem } from './actions'; // Importa as ações do servidor

export default function App() {
  const [estoque, setEstoque] = useState([]);
  const [loading, setLoading] = useState(true);

  // 1. CARREGAR DADOS DO SERVIDOR QUANDO A PÁGINA ABRE
  useEffect(() => {
    async function carregar() {
      try {
        setLoading(true);
        const dados = await buscarEstoque();
        setEstoque(dados);
      } catch (error) {
        console.error('Erro ao carregar dados:', error);
      } finally {
        setLoading(false);
      }
    }

    carregar();
  }, []);

  // 2. FUNÇÃO PARA SALVAR COM ATUALIZAÇÃO OTIMISTA E ROLLBACK
  const salvarEstoque = async (novoEstoque) => {
    const estoqueAnterior = estoque; // Salva o estado atual para caso ocorra erro
    
    // Atualiza a tela imediatamente (Optimistic Update)
    setEstoque(novoEstoque);

    try {
      // Envia os dados para a Server Action de forma segura
      await salvarEstoqueNaNuvem(novoEstoque);
    } catch (error) {
      console.error('Erro ao salvar dados na nuvem:', error);
      alert('Houve um erro ao salvar os dados na nuvem. Suas alterações na tela foram revertidas.');
      
      // ROLLBACK: Reverte o estado visual para o que estava antes do erro
      setEstoque(estoqueAnterior);
    }
  };

  if (loading) {
    return <div style={{ padding: '20px', textAlign: 'center' }}>Carregando dados do estoque...</div>;
  }

  return (
    <div>
      {/* Aqui fica o resto do JSX do seu painel */}
    </div>
  );
}
