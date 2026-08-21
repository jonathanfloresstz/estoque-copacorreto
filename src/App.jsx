import { useEffect, useState } from 'react';
import { redis } from './lib/redis'; // Ajuste o caminho se seu arquivo estiver em outro diretório

export default function App() {
  const [estoque, setEstoque] = useState([]);
  const [loading, setLoading] = useState(true);

  // 1. CARREGAR DADOS DO UPSTASH REDIS QUANDO A PÁGINA ABRE
  useEffect(() => {
    async function carregarEstoque() {
      try {
        setLoading(true);
        const dadosSalvos = await redis.get('estoque_copa_limpeza');
        if (dadosSalvos) {
          setEstoque(dadosSalvos);
        }
      } catch (error) {
        console.error('Erro ao buscar dados no Redis:', error);
      } finally {
        setLoading(false);
      }
    }

    carregarEstoque();
  }, []);

  // 2. FUNÇÃO PARA SALVAR ALTERAÇÕES (Adicionar, remover, movimentar item)
  const salvarEstoque = async (novoEstoque) => {
    // Atualiza o estado da tela imediatamente para não haver travamentos
    setEstoque(novoEstoque);

    // Envia e grava os dados permanentemente no banco de dados da Vercel / Upstash
    try {
      await redis.set('estoque_copa_limpeza', novoEstoque);
    } catch (error) {
      console.error('Erro ao salvar dados no Redis:', error);
      alert('Houve um erro ao salvar os dados na nuvem.');
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
