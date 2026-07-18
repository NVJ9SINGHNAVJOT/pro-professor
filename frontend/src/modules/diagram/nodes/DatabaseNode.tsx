import { Database } from "lucide-react";
import type { NodeProps } from "@xyflow/react";
import NodeShell from "@/modules/diagram/nodes/NodeShell";
import type { DiagramFlowNode } from "@/modules/diagram/adapter/ReactFlowAdapter";

const DatabaseNode = ({ data, selected }: NodeProps<DiagramFlowNode>) => (
  <NodeShell icon={<Database size={16} />} iconClassName="text-emerald-400" label={data.label} selected={selected} />
);

export default DatabaseNode;
