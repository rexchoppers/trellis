// Decision-tree palette shared by the gate nodes and their edges. Keeping the
// two branch colours here (rather than inline in each component) means the
// gate dot and the edge it feeds always match, and re-theming is one edit.
export const GATE_APPROVED = '#9ece6a' // green: approved, continue to the next step
export const GATE_CHANGES = '#e0af68' // amber: changes requested, loop back to an earlier node
export const NODE_OUTLINE = '#10131a' // dark ring around the coloured gate dots
