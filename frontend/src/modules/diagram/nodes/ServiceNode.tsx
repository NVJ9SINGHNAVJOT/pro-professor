import { Server } from "lucide-react";
import type { NodeProps } from "@xyflow/react";
import NodeShell from "@/modules/diagram/nodes/NodeShell";
import type { DiagramFlowNode } from "@/modules/diagram/adapter/ReactFlowAdapter";

const ServiceNode = ({ data, selected }: NodeProps<DiagramFlowNode>) => (
  <NodeShell icon={<Server size={16} />} iconClassName="text-sky-400" label={data.label} selected={selected} />
);

export default ServiceNode;
