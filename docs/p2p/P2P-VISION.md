# P2P Knowledge Graph — Folklore Vision

> **Federation model (V5).** Sharing is per-node: a node is shared
> over P2P unless it is marked `private` (a per-node boolean). An
> optional `workspace` tag groups nodes by capture-repo for read-side
> filtering but is LOCAL-ONLY and never crosses the wire; a node's
> `source_uri` scheme records its origin. There is no room
> abstraction. See [`../architecture/V5-PROTOCOL.md`](../architecture/V5-PROTOCOL.md)
> for the shipped wire format. The vision below is framed in those
> primitives.

## The Idea

Every developer running Folklore has a local knowledge graph. Right now these graphs are isolated — your homelab research doesn't connect to mine.

**v2.0 makes them connected.** A peer-to-peer network where Folklore nodes discover each other, share graph fragments, and build a collective knowledge layer that's bigger than any single user's research.

```
Developer A (homelab)          Developer B (ml-papers)
     ┌───────────┐                 ┌───────────┐
     │ 500 nodes │                 │ 800 nodes │
     │ 420 shared│                 │ 700 shared│
     └────┬──────┘                 └────┬──────┘
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
- Each node defaults to shared; nodes marked `private` stay local (homelab stays mine)
- Shared nodes are replicated via CRDT (conflict-free replicated data types)
- Only node metadata + embeddings are shared — not raw source content

### Collective Intelligence
- Tunnel detection runs ACROSS peers — my homelab connects to your ml-papers
- Shared discovery loop: if peer B finds a great ArXiv source, peer A gets it suggested
- Federated search: `folklore ask "vector search" --peers` searches across all connected graphs

### Privacy Model
- **Per-node control** — mark any node `private` to keep it local
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
    replication.ts       CRDT-based node synchronization
    federated-search.ts  Cross-peer semantic search aggregation
    privacy.ts           Per-node private gate, metadata stripping

  cli/
    commands/
      peer.ts            peer add|remove|list|status
      share.ts           share|unshare a node (toggle the private gate)
```

### Protocol

```
PEER_HELLO    → exchange capabilities, node counts
GRAPH_SYNC    → CRDT state vector exchange for shared nodes
NODE_PUSH     → push new nodes (metadata + embedding only)
SEARCH_QUERY  → federated search request
SEARCH_RESULT → aggregated results from peer's local graph
TUNNEL_ALERT  → cross-peer tunnel candidate notification
```

### CRDT Choice

Use **Automerge** or **Y.js** for the graph CRDT:
- The shared graph is a single CRDT document
- Node inserts/updates/deletes converge across peers
- No coordination server needed — peers sync directly
- Offline-first — changes queue and sync when reconnected

## Use Cases

### Research Teams
A team of 5 researchers each tracks different domains. P2P Folklore connects their graphs. When researcher A indexes a paper about "efficient attention", researcher B (tracking "GPU optimization") gets a tunnel notification: "your GPU optimization connects to A's attention paper."

### Open Source Communities
A project maintainer shares their `project-x` graph (everything not marked `private`). Contributors connect as peers and get the maintainer's research context (relevant papers, HN discussions, competitor analysis) automatically merged into their local graph.

### Conference Networks
At a conference, attendees run Folklore in P2P mode. Their graphs auto-discover via local network. The collective graph of 100 attendees, each with 500 nodes, creates a 50K-node searchable knowledge base spanning every talk, paper, and conversation.

## Implementation Phases

### Phase 15: P2P Foundation
- Peer identity (ed25519 keypair)
- Manual peer management (`peer add/remove/list`)
- Basic graph fragment exchange over WebSocket

### Phase 16: Node Sharing
- Per-node `private` gate (`share/unshare`)
- CRDT-based graph sync (Automerge)
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
