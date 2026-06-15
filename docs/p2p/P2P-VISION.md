# P2P Knowledge Graph — Folklore v2.0 Vision

> **Snapshot — v2.0 (pre-V5).** This vision doc was written when
> rooms were the federation primitive. The federation model has
> since shipped (V5 — see [`../architecture/V5-PROTOCOL.md`](../architecture/V5-PROTOCOL.md))
> with `workspace?: string` (read-side, local-only) + per-node
> `private: boolean` (sharing gate) replacing rooms entirely.
> Treat every "room" below as roughly "workspace tag + private
> flag" — the conceptual shape (peers, federation, mesh discovery,
> attribution) survives; the room vocabulary doesn't. Kept as a
> historical record of how the vision was framed before V5.

## The Idea

Every developer running Folklore has a local knowledge graph. Right now these graphs are isolated — your homelab research doesn't connect to mine.

**v2.0 makes them connected.** A peer-to-peer network where Folklore nodes discover each other, share graph fragments, and build a collective knowledge layer that's bigger than any single user's research.

```
Developer A (homelab)          Developer B (ml-papers)
     ┌──────────┐                  ┌──────────┐
     │ 500 nodes│                  │ 800 nodes│
     │ 3 rooms  │                  │ 2 rooms  │
     └────┬─────┘                  └────┬─────┘
          │         P2P mesh             │
          └──────────┬───────────────────┘
                     │
            ┌────────┴────────┐
            │ Shared subgraph │
            │  tunnels across │
            │  both graphs    │
            └─────────────────┘
```

## How It Works

### Discovery
- Nodes announce themselves on a local network via mDNS/Bonjour
- Or register with a lightweight coordination server (optional)
- Or manually add peers: `folklore peer add <address>`

### Sharing Protocol
- Each node exposes a subset of its graph as "public rooms"
- Private rooms stay local (homelab stays mine)
- Shared rooms are replicated via CRDT (conflict-free replicated data types)
- Only node metadata + embeddings are shared — not raw source content

### Collective Intelligence
- Tunnel detection runs ACROSS peers — my homelab connects to your ml-papers
- Shared discovery loop: if peer B finds a great ArXiv source, peer A gets it suggested
- Federated search: `folklore ask "vector search" --peers` searches across all connected graphs

### Privacy Model
- **Opt-in only** — nothing shared by default
- **Room-level control** — mark rooms as public/private
- **Metadata only** — share node labels + embeddings, not full text
- **No central server** — peers connect directly
- **Encryption** — all P2P traffic encrypted with peer-to-peer TLS

## Architecture

```
src/
  p2p/
    peer.ts              Peer identity (keypair, address, capabilities)
    discovery.ts         mDNS + manual peer registry
    protocol.ts          Graph fragment exchange protocol (protobuf over QUIC)
    replication.ts       CRDT-based room synchronization
    federated-search.ts  Cross-peer semantic search aggregation
    privacy.ts           Room visibility rules, metadata stripping

  cli/
    commands/
      peer.ts            peer add|remove|list|status
      share.ts           share room|unshare room
```

### Protocol

```
PEER_HELLO    → exchange capabilities, room lists, node counts
ROOM_SYNC     → CRDT state vector exchange for shared rooms
NODE_PUSH     → push new nodes (metadata + embedding only)
SEARCH_QUERY  → federated search request
SEARCH_RESULT → aggregated results from peer's local graph
TUNNEL_ALERT  → cross-peer tunnel candidate notification
```

### CRDT Choice

Use **Automerge** or **Y.js** for the room-level CRDT:
- Each shared room is a CRDT document
- Node inserts/updates/deletes converge across peers
- No coordination server needed — peers sync directly
- Offline-first — changes queue and sync when reconnected

## Use Cases

### Research Teams
A team of 5 researchers each tracks different domains. P2P Folklore connects their graphs. When researcher A indexes a paper about "efficient attention", researcher B (tracking "GPU optimization") gets a tunnel notification: "your GPU optimization connects to A's attention paper."

### Open Source Communities
A project maintainer shares their `project-x` room publicly. Contributors connect as peers and get the maintainer's research context (relevant papers, HN discussions, competitor analysis) automatically merged into their local graph.

### Conference Networks
At a conference, attendees run Folklore in P2P mode. Their graphs auto-discover via local network. The collective graph of 100 attendees, each with 500 nodes, creates a 50K-node searchable knowledge base spanning every talk, paper, and conversation.

## Implementation Phases

### Phase 15: P2P Foundation
- Peer identity (ed25519 keypair)
- Manual peer management (`peer add/remove/list`)
- Basic graph fragment exchange over WebSocket

### Phase 16: Room Sharing
- Public/private room marking (`share room/unshare room`)
- CRDT-based room sync (Automerge)
- Metadata-only replication (no raw text)

### Phase 17: Federated Search
- Cross-peer search aggregation
- Tunnel detection across peers
- Shared discovery loop

### Phase 18: Production P2P
- mDNS auto-discovery
- QUIC transport (faster than WebSocket)
- Encryption + auth
- Bandwidth management + sync throttling

## What This Means

Folklore goes from "your personal research memory" to "a collective intelligence network for developers." Every peer makes the network smarter. The graph grows faster than any individual could build it.

This is the end state: **a decentralized knowledge graph where every coding agent in the world shares what it learned.**
