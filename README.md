# Drum Coach

A personal AI drum instructor for the Millenium MPS-150 e-kit, running locally in Chrome.

- `CLAUDE.md`: instructions Claude Code reads automatically in every session
- `docs/SPEC.md`: what we're building, and the milestones
- `docs/KIT.md`: verified facts about the drum kit and its MIDI
- `prototype/drum-stage.html`: working prototype (open it in Chrome)

## Start on Linux

1. Install Claude Code (needs a Claude subscription or Anthropic Console account):
   ```bash
   curl -fsSL https://claude.ai/install.sh | bash
   ```
   Open a new terminal and check it with `claude --version`.
2. Install Node.js 20+ and git if you don't have them (`node -v`, `git --version`).
3. Unzip this folder, then:
   ```bash
   cd ~/drum-coach
   git init && git add . && git commit -m "Project brief and prototype"
   claude
   ```
4. Paste this as your first message:

   > Read CLAUDE.md, docs/SPEC.md and docs/KIT.md, and look at prototype/drum-stage.html.
   > Then plan milestone M0 and M1 and build them. Keep the keyboard fallback working so you
   > can test without the kit. When M1 is done, tell me how to run it so I can test with my drums.

5. After each milestone, test with your kit and ask for the next one ("now do M2").

For the AI coach (M4) you'll need an Anthropic API key from https://platform.claude.com
in a `.env` file. Claude Code will set this up and tell you when.
