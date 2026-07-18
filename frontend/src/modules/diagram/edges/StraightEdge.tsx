import { BaseEdge, getStraightPath } from "@xyflow/react";
import type { EdgeProps } from "@xyflow/react";
import EdgeLabel from "@/modules/diagram/edges/EdgeLabel";

const StraightEdge = ({ id, sourceX, sourceY, targetX, targetY, label, markerEnd, style }: EdgeProps) => {
  const [path, labelX, labelY] = getStraightPath({ sourceX, sourceY, targetX, targetY });
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} />
      <EdgeLabel label={label} x={labelX} y={labelY} />
    </>
  );
};

export default StraightEdge;
