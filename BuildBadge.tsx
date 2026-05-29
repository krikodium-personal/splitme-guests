import { getBuildLabel } from './lib/buildInfo';

const BuildBadge = () => (
  <div
    className="fixed bottom-[5.75rem] right-3 z-30 pointer-events-none select-none text-[9px] font-mono text-white/25 tabular-nums tracking-tight"
    aria-hidden="true"
    title={`Deploy ${getBuildLabel()}`}
  >
    {getBuildLabel()}
  </div>
);

export default BuildBadge;
