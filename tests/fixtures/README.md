`red-bedroom.save.json` was generated locally with the original English Red ROM:
new game, default trainer RED / rival BLUE, bedroom, START → SAVE → YES.
No ROM bytes are embedded. The fixture includes a full Gambatte checkpoint and
the 32 KiB native battery save, so migration tests exercise the actual game
loader/checksum and the legacy app's state-only storage format. The SRAM layout
is shared with the translated ROM; Red/Blue and language isolation is tested
separately through game identity metadata.
