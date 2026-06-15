# folklore CLI demo — accumulate · share · stream
# Recorded via VHS (https://github.com/charmbracelet/vhs).
#
# Thesis: folklore is a COMMUNITY network. Everyone who runs it
# contributes a shard. Whatever you're debugging at 4pm Friday,
# someone in the network already solved at 3am Wednesday. Your next
# LLM session starts from what the community already knows — no
# 30-min web dive, no burned tokens, no duplicated work.
#
# Beats:
#   1. Thesis banner       — what folklore does in one sentence
#   2. Identity + peers    — did:key + libp2p, not a SaaS row
#   3. Ask the graph       — one query, three sources, cross-source
#   4. Federate            — community shards stream in via libp2p
#   5. Wired into Claude   — claude mcp get confirms the MCP surface
#   6. Closer              — every future session starts from what
#                            the community already knows

Output docs/demo.gif

Set Shell "zsh"
Set FontSize 13
Set Width 1000
Set Height 620
Set TypingSpeed 26ms
Set PlaybackSpeed 1.0
Set Theme "Catppuccin Mocha"
Set Padding 20
Set Margin 0
Set BorderRadius 10
Set WindowBar Colorful
Set WindowBarSize 30

# ─── hidden setup ────────────────────────────────────────────
Hide
Type "setopt interactive_comments"
Enter
Type "clear"
Enter
Sleep 200ms
Show

# ─── Beat 1 — THESIS banner ──────────────────────────────────
Type `echo "▸ folklore — accumulate · share · stream knowledge into every LLM session"`
Enter
Sleep 2000ms

Hide
Type "clear"
Enter
Show

# ─── Beat 2 — IDENTITY + NETWORK ─────────────────────────────
Type "# identity is math you own — W3C did:key + libp2p PeerId"
Enter
Sleep 500ms
Type "folklore peer status"
Enter
Sleep 2400ms

Hide
Type "clear"
Enter
Show

# ─── Beat 3 — ASK (cross-source in one query) ────────────────
Type "# one query. GitHub repos, your own code, research notes. under 1 second."
Enter
Sleep 600ms
Type@28ms `folklore ask "vector search sqlite" --k 3`
Enter
Sleep 3200ms

Hide
Type "clear"
Enter
Show

# ─── Beat 4 — FEDERATE (community shards) ────────────────────
Type "# federate — every folklore peer, anywhere, contributes a shard"
Enter
Sleep 600ms
Type@28ms `folklore ask "P2P knowledge graph" --k 3 --peers`
Enter
Sleep 3000ms

Hide
Type "clear"
Enter
Show

# ─── Beat 5 — WIRED into every LLM session ───────────────────
Type "# every claude / codex / cursor / continue session gets 21 MCP tools"
Enter
Sleep 600ms
Type "claude mcp get folklore"
Enter
Sleep 2400ms

Hide
Type "clear"
Enter
Show

# ─── Beat 6 — CLOSER ─────────────────────────────────────────
Type `echo "▸ every future LLM session starts from what the community already knows."`
Enter
Sleep 2200ms

Sleep 1500ms
