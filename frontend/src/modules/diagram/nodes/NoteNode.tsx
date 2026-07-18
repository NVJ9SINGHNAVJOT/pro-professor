import { StickyNote } from "lucide-react";
import type { NodeProps } from "@xyflow/react";
import NodeShell from "@/modules/diagram/nodes/NodeShell";
import type { DiagramFlowNode } from "@/modules/diagram/adapter/ReactFlowAdapter";

const NoteNode = ({ data, selected }: NodeProps<DiagramFlowNode>) => (
  <NodeShell icon={<StickyNote size={16} />} iconClassName="text-amber-400" label={data.label} selected={selected} />
);

export default NoteNode;
