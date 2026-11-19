import vietnamese from './vi-roms.json' with { type: 'json' };
const gameBoy = { system: 'gb', core: 'gambatte', saveSchema: 'pokered-sram-v1' };
export const games = {
  red: { ...gameBoy, id: 'red', base: 'red', language: 'en', name: 'Pokémon Red', file: 'pokered.gbc', sha1: 'ea9bcae617fdf159b045185467ae58b2e4a48b9a', color: '#e35d56' },
  blue: { ...gameBoy, id: 'blue', base: 'blue', language: 'en', name: 'Pokémon Blue', file: 'pokeblue.gbc', sha1: 'd7037c83e1ae5b39bde3c30787637ba1d4c48ce2', color: '#639dee' },
};
for (const [id, rom] of Object.entries(vietnamese)) {
  const base = id.split('-')[0];
  games[id] = { ...games[base], ...rom, id, base, language: 'vi' };
}
// FireRed (USA) 1.0 built from pret/pokefirered + TekCafe "Pokémon Anime Version"
// v2.0.7 BPS patch (scripts/patch-anime.mjs). Vietnamese only.
// The save schema covers FireRed flash saves; Gambatte SRAM migration never applies.
games.anime = {
  id: 'anime', base: 'anime', language: 'vi', system: 'gba', core: 'mgba', saveSchema: 'firered-anime-v2',
  name: 'Pokémon Anime Version', shortName: 'Anime Version', version: 'v2.0.7',
  file: 'pokeanime_vi.gba', sha1: 'a9fe9246d4c69a7453a1945505bbbc7844bc2f23', color: '#e9b33c',
};
// Releases before save metadata existed. Keep these even when ROMs are rebuilt.
export const legacySaveGames = {
  ea9bcae617fdf159b045185467ae58b2e4a48b9a: 'red',
  d7037c83e1ae5b39bde3c30787637ba1d4c48ce2: 'blue',
  '3df77b1e955a53788f96249bc7309a23b020ca7f': 'red-vi',
  ba5d79ce5513f587f3fad780959dd2abe5065a3c: 'blue-vi',
};
export const getGame = (id) => games[id] || games['red-vi'] || games.red;
// The same base game in another language, falling back to the only edition.
export const variant = (base, language) =>
  games[language === 'vi' && base !== 'anime' ? `${base}-vi` : base] || games[`${base}-vi`] || games[base];
export const romName = game => game.file.replace(/\.(gbc|gba)$/, '');
