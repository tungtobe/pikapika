`red-bedroom.save.json` was generated locally with the original English Red ROM:
new game, default trainer RED / rival BLUE, bedroom, START → SAVE → YES.
No ROM bytes are embedded. The fixture includes a full Gambatte checkpoint and
the 32 KiB native battery save, so migration tests exercise the actual game
loader/checksum and the legacy app's state-only storage format. The SRAM layout
is shared with the translated ROM; Red/Blue and language isolation is tested
separately through game identity metadata.

`anime-ep83.sav` is the "Save test tập 83" flash save (128 KiB, no ROM bytes)
shipped by TekCafe with the Pokémon Anime Version v2.0.7 patch. It exercises
raw `.sav` import into mGBA and the FireRed save-sector signature check.
