import React from 'react';
import { MenuItem } from '../types';
import { formatPrice } from '../lib/currency';

type Props = {
  items: MenuItem[];
  addingIds: Set<string>;
  getItemImageUrl: (imageUrl?: string | null) => string;
  onAdd: (item: MenuItem) => void;
  onOpen: (item: MenuItem) => void;
};

const hasVariants = (item: MenuItem) => (item.variant_groups?.length || 0) > 0;

export const UpsellStrip: React.FC<Props> = ({ items, addingIds, getItemImageUrl, onAdd, onOpen }) => {
  if (items.length === 0) return null;

  return (
    <div className="mb-8">
      <p className="text-[12px] font-semibold text-white/55 mb-3">Suele pedirse con esto</p>
      <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-2 px-2">
        {items.map(item => (
          <UpsellCard
            key={item.id}
            item={item}
            compact
            adding={addingIds.has(item.id)}
            imageUrl={getItemImageUrl(item.image_url)}
            onAdd={onAdd}
            onOpen={onOpen}
          />
        ))}
      </div>
    </div>
  );
};

export const UpsellSheet: React.FC<Props & {
  anchorName: string;
  onDismiss: () => void;
}> = ({ items, anchorName, addingIds, getItemImageUrl, onAdd, onOpen, onDismiss }) => {
  if (items.length === 0) return null;

  return (
    <div className="fixed inset-0 z-[90] flex flex-col justify-end max-w-md mx-auto">
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label="Cerrar sugerencias"
        onClick={onDismiss}
      />
      <div className="relative bg-surface-dark border-t border-white/10 rounded-t-3xl px-5 pt-5 pb-[calc(env(safe-area-inset-bottom)+6.5rem)]">
        <div className="w-10 h-1 rounded-full bg-white/15 mx-auto mb-4" />
        <p className="text-[11px] font-semibold uppercase tracking-wider text-primary mb-1">Para esta mesa</p>
        <h3 className="text-white font-bold text-[17px] leading-tight mb-4">
          Quienes pidieron {anchorName} también sumaron
        </h3>
        <div className="space-y-2.5">
          {items.map(item => (
            <UpsellCard
              key={item.id}
              item={item}
              adding={addingIds.has(item.id)}
              imageUrl={getItemImageUrl(item.image_url)}
              onAdd={onAdd}
              onOpen={onOpen}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="w-full mt-4 h-11 rounded-xl bg-white/5 border border-white/10 text-white/60 text-sm font-medium"
        >
          Ahora no
        </button>
      </div>
    </div>
  );
};

const UpsellCard: React.FC<{
  item: MenuItem;
  imageUrl: string;
  adding: boolean;
  compact?: boolean;
  onAdd: (item: MenuItem) => void;
  onOpen: (item: MenuItem) => void;
}> = ({ item, imageUrl, adding, compact, onAdd, onOpen }) => {
  const needsPdp = hasVariants(item);

  if (compact) {
    return (
      <div className="shrink-0 w-[148px] rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
        <button type="button" onClick={() => onOpen(item)} className="block w-full text-left">
          <div className="h-20 bg-surface-dark-alt">
            {imageUrl ? (
              <img src={imageUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <span className="material-symbols-outlined text-white/20">restaurant</span>
              </div>
            )}
          </div>
          <div className="p-2.5">
            <p className="text-white text-xs font-semibold line-clamp-2 min-h-[2rem]">{item.name}</p>
            <p className="text-white/70 text-xs font-medium mt-1">${formatPrice(Number(item.price))}</p>
          </div>
        </button>
        <div className="px-2.5 pb-2.5">
          <button
            type="button"
            disabled={adding}
            onClick={() => (needsPdp ? onOpen(item) : onAdd(item))}
            className="w-full h-8 rounded-lg bg-primary text-background-dark text-[11px] font-semibold disabled:opacity-50"
          >
            {adding ? '…' : needsPdp ? 'Elegir' : 'Sumar'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-2.5">
      <button type="button" onClick={() => onOpen(item)} className="size-14 rounded-xl overflow-hidden bg-surface-dark-alt shrink-0">
        {imageUrl ? (
          <img src={imageUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="material-symbols-outlined text-white/20 text-2xl">restaurant</span>
        )}
      </button>
      <button type="button" onClick={() => onOpen(item)} className="flex-1 min-w-0 text-left">
        <p className="text-white text-sm font-semibold truncate">{item.name}</p>
        <p className="text-white/60 text-xs mt-0.5">${formatPrice(Number(item.price))}</p>
      </button>
      <button
        type="button"
        disabled={adding}
        onClick={() => (needsPdp ? onOpen(item) : onAdd(item))}
        className="h-9 px-3 rounded-xl bg-primary text-background-dark text-xs font-semibold shrink-0 disabled:opacity-50"
      >
        {adding ? '…' : needsPdp ? 'Elegir' : 'Sumar'}
      </button>
    </div>
  );
};
