export const definition = {
  type: 'function',
  function: {
    name: 'get_system_time',
    description: 'Retorna a hora atual do sistema. Chame esta função sempre que o usuário perguntar as horas.',
    parameters: {
      type: 'object',
      properties: {},
      required: []
    }
  }
};

export async function execute(args) {
  const horas = new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
  return {
    time: `Agora são ${horas}`
  };
}
