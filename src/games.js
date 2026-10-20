import vietnamese from './vi-roms.json' with { type: 'json' };
export const games = {
  red: { id: 'red', base: 'red', language: 'en', name: 'Pokémon Red', file: 'pokered.gbc', sha1: 'ea9bcae617fdf159b045185467ae58b2e4a48b9a', color: '#e35d56' },
  blue: { id: 'blue', base: 'blue', language: 'en', name: 'Pokémon Blue', file: 'pokeblue.gbc', sha1: 'd7037c83e1ae5b39bde3c30787637ba1d4c48ce2', color: '#639dee' },
};
for (const [id, rom] of Object.entries(vietnamese)) {
  const base = id.split('-')[0];
  games[id] = { ...games[base], ...rom, id, base, language: 'vi' };
}
export const getGame = (id) => games[id] || games.red;
