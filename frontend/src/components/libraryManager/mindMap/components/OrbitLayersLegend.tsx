import React from "react";

const OrbitLayersLegend = ({ activeLayer }: { activeLayer: string | null }) => {
  return (
    <div
      className={`absolute top-6 right-8 bg-surface/90  -sm border border-gray-300 p-5 shadow-sm z-10 w-64 rounded-none transition-transform duration-500 ${
        activeLayer ? "translate-x-[150%]" : "translate-x-0"
      }`}
    >
      <h3 className="text-[9px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-4 border-b border-border-subtle pb-2">
        Orbit Layers
      </h3>
      <ul className="space-y-3 text-[11px] font-bold text-gray-700 tracking-wider uppercase">
        <li className="flex items-center gap-3">
          <span className="w-4 h-4 bg-surface flex items-center justify-center border border-gray-300">
            <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
          </span>{" "}
          Library (Available){" "}
          <span className="text-gray-400 ml-auto">R 110</span>
        </li>
        <li className="flex items-center gap-3">
          <span className="w-4 h-4 bg-surface flex items-center justify-center border border-gray-300">
            <span className="w-2 h-2 bg-black rounded-full"></span>
          </span>{" "}
          Brain (Registry) <span className="text-gray-400 ml-auto">R 190</span>
        </li>
        <li className="flex items-center gap-3">
          <span className="w-4 h-4 bg-surface flex items-center justify-center border border-gray-300">
            <span className="w-2 h-2 bg-rose-700 rounded-full"></span>
          </span>{" "}
          Echoes <span className="text-gray-400 ml-auto">R 270</span>
        </li>
        <li className="flex items-center gap-3">
          <span className="w-4 h-4 bg-surface flex items-center justify-center border border-gray-300">
            <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
          </span>{" "}
          Notes <span className="text-gray-400 ml-auto">R 400</span>
        </li>
        <li className="flex items-center gap-3">
          <span className="w-4 h-4 bg-surface flex items-center justify-center border border-gray-300">
            <span className="w-2 h-2 bg-amber-500 rounded-full"></span>
          </span>{" "}
          Stacks <span className="text-gray-400 ml-auto">R 410</span>
        </li>
      </ul>
    </div>
  );
};

export default OrbitLayersLegend;
