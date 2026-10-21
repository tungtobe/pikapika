import vietnamese from './vi-roms.json' with { type: 'json' };
export const games = {
  red: { id: 'red', base: 'red', language: 'en', name: 'Pokémon Red', file: 'pokered.gbc', sha1: 'ea9bcae617fdf159b045185467ae58b2e4a48b9a', color: '#e35d56' },
  blue: { id: 'blue', base: 'blue', language: 'en', name: 'Pokémon Blue', file: 'pokeblue.gbc', sha1: 'd7037c83e1ae5b39bde3c30787637ba1d4c48ce2', color: '#639dee' },
};
for (const [id, rom] of Object.entries(vietnamese)) {
  const base = id.split('-')[0];
  games[id] = { ...games[base], ...rom, id, base, language: 'vi' };
}
// Stable save format, independent of ROM/text checksums. Bump this if a ROM
// changes SRAM layout, map/species IDs, or other persisted game data.
for (const game of Object.values(games)) game.saveSchema = 'pokered-sram-v1';
// Releases before save metadata existed. Keep these even when ROMs are rebuilt.
export const legacySaveGames = {
  ea9bcae617fdf159b045185467ae58b2e4a48b9a: 'red',
  d7037c83e1ae5b39bde3c30787637ba1d4c48ce2: 'blue',
  '3df77b1e955a53788f96249bc7309a23b020ca7f': 'red-vi',
  ba5d79ce5513f587f3fad780959dd2abe5065a3c: 'blue-vi',
};
export const getGame = (id) => games[id] || games['red-vi'] || games.red;
