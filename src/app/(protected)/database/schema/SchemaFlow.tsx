"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import ELK from "elkjs/lib/elk.bundled.js";
import type { SchemaGraph } from "@/lib/types/supabase-clone";

const elk = new ELK();

const ROW_HEIGHT = 22;
const HEADER_HEIGHT = 44;
const FOOTER_HEIGHT = 8;
const NODE_WIDTH = 260;

type TableNodeData = {
  table: string;
  schema: string;
  columns: SchemaGraph["nodes"][number]["columns"];
};

function TableNode({ data }: NodeProps) {
  const d = data as TableNodeData;
  return (
    <div className="rounded-lg border border-border bg-surface-200 shadow-sm overflow-hidden" style={{ width: NODE_WIDTH }}>
      <div className="px-3 py-2 bg-surface-300 border-b border-border">
        <div className="font-medium text-sm text-gray-800">{d.table}</div>
        <div className="text-[11px] text-gray-500">{d.schema}</div>
      </div>
      <ul className="text-xs">
        {d.columns.map((col) => (
          <li
            key={col.name}
            className="flex items-center justify-between px-3 py-1 border-b border-border last:border-b-0"
            style={{ height: ROW_HEIGHT }}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="font-mono text-gray-800 truncate">{col.name}</span>
              {col.isPrimaryKey && (
                <span className="px-1 py-0.5 rounded bg-amber-50 text-amber-700 text-[10px]">PK</span>
              )}
              {col.isForeignKey && (
                <span className="px-1 py-0.5 rounded bg-sky-50 text-sky-700 text-[10px]">FK</span>
              )}
            </div>
            <span className="text-gray-500 font-mono ml-2 shrink-0 truncate">{col.dataType}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const nodeTypes = { table: TableNode };

function nodeHeight(columnCount: number) {
  return HEADER_HEIGHT + columnCount * ROW_HEIGHT + FOOTER_HEIGHT;
}

export default function SchemaFlow({ graph }: { graph: SchemaGraph }) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);

  const rawNodes: Node[] = useMemo(
    () =>
      graph.nodes.map((n) => ({
        id: n.id,
        type: "table",
        position: { x: 0, y: 0 },
        data: { table: n.table, schema: n.schema, columns: n.columns } satisfies TableNodeData,
      })),
    [graph.nodes],
  );

  const rawEdges: Edge[] = useMemo(
    () =>
      graph.edges.map((e, i) => ({
        id: `e-${i}-${e.source}-${e.target}`,
        source: e.source,
        target: e.target,
        label: e.sourceColumn ? `${e.sourceColumn} → ${e.targetColumn ?? ""}` : undefined,
        animated: false,
        style: { stroke: "#7dd3fc" },
        labelStyle: { fontSize: 10, fill: "#64748b" },
        labelBgStyle: { fill: "#f8fafc" },
      })),
    [graph.edges],
  );

  useEffect(() => {
    let cancelled = false;

    const elkGraph = {
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": "RIGHT",
        "elk.spacing.nodeNode": "40",
        "elk.layered.spacing.nodeNodeBetweenLayers": "80",
      },
      children: graph.nodes.map((n) => ({
        id: n.id,
        width: NODE_WIDTH,
        height: nodeHeight(n.columns.length),
      })),
      edges: graph.edges.map((e, i) => ({
        id: `e-${i}`,
        sources: [e.source],
        targets: [e.target],
      })),
    };

    elk
      .layout(elkGraph)
      .then((laid) => {
        if (cancelled) return;
        const positioned = rawNodes.map((n) => {
          const child = laid.children?.find((c) => c.id === n.id);
          return {
            ...n,
            position: { x: child?.x ?? 0, y: child?.y ?? 0 },
          };
        });
        setNodes(positioned);
        setEdges(rawEdges);
      })
      .catch((err) => {
        console.error("ELK layout failed", err);
        setNodes(rawNodes);
        setEdges(rawEdges);
      });

    return () => {
      cancelled = true;
    };
  }, [graph, rawNodes, rawEdges]);

  return (
    <ReactFlowProvider>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        proOptions={{ hideAttribution: true }}
        minZoom={0.2}
        maxZoom={1.5}
      >
        <Background gap={20} size={1} color="#e5e7eb" />
        <Controls position="bottom-right" />
        <MiniMap pannable zoomable position="bottom-left" />
      </ReactFlow>
    </ReactFlowProvider>
  );
}
