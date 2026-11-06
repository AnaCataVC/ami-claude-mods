export type Peer = {
  // The session's message address when known, else the first name it was seen under.
  key: string
  name: string
  // Every address, session id and name this peer was seen under; outbound `to` values match against these.
  aliases: string[]
  received: number
  sent: number
  lastAt: number
  lastDirection: 'in' | 'out'
  // Whitespace-collapsed, truncated text of the last message either way.
  lastMessage?: string
  // The last message as written (envelope stripped, line breaks kept, capped at a few KB), inbound only.
  lastMessageFull?: string
  // Whether the last inbound message (full text, not the preview) reads as a question.
  asked?: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'child-sessions': {
      lang: 'en' | 'es'
      peers: Peer[]
      subagentNames: string[]
      // Peer key -> lastAt of the inbound message dismissed from the question band.
      dismissed: Record<string, number>
      // Peer keys whose full last message the band shows under their row.
      expanded: string[]
    }
  }
}
