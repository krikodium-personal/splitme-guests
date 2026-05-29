import { getBuildLabel } from './lib/buildInfo';

const BuildBadge = () => (
  <div
    className="fixed bottom-[9.5rem] right-3 z-[60] pointer-events-none select-none rounded px-1.5 py-0.5 text-[10px] font-mono tabular-nums tracking-tight text-white/70 bg-black/40 backdrop-blur-sm"
    aria-hidden="true"
    title={`Deploy ${getBuildLabel()}`}
  >
    {getBuildLabel()}
  </div>
);

export default BuildBadge;
