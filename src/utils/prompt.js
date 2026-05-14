import readline from 'node:readline';

export async function promptChoice(question, choices) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const labels = choices.map((c) => `[${c.key}]${c.label}`).join(' / ');
  return new Promise((resolve) => {
    const ask = () => {
      rl.question(`${question} (${labels}): `, (answer) => {
        const normalized = answer.trim().toLowerCase();
        const match = choices.find((c) => c.key.toLowerCase() === normalized);
        if (match) {
          rl.close();
          resolve(match.key);
        } else {
          ask();
        }
      });
    };
    ask();
  });
}
