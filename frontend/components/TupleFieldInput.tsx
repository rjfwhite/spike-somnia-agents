"use client";

import { Plus, Trash2 } from "lucide-react";
import type { AbiParameter } from "@/lib/types";

interface TupleFieldInputProps {
    input: AbiParameter;
    value: any;
    onChange: (value: any) => void;
}

function getPlaceholder(type: string): string {
    if (type.startsWith('uint') || type.startsWith('int')) return '123';
    if (type === 'bool') return 'true';
    if (type === 'address') return '0x...';
    if (type.endsWith('[]')) return '["a", "b"] or a, b';
    return 'value';
}

function TupleFields({ components, value, onChange }: {
    components: AbiParameter[];
    value: Record<string, any>;
    onChange: (value: Record<string, any>) => void;
}) {
    return (
        <div className="space-y-2 pl-3 border-l-2 border-purple-500/30">
            {components.map((comp) => (
                <div key={comp.name}>
                    <label className="block text-xs text-gray-500 mb-1">
                        {comp.name} <span className="text-purple-400/60">({comp.type})</span>
                    </label>
                    {comp.type === 'tuple' && comp.components ? (
                        <TupleFields
                            components={comp.components}
                            value={(value && value[comp.name]) || {}}
                            onChange={(v) => onChange({ ...value, [comp.name]: v })}
                        />
                    ) : (
                        <input
                            type="text"
                            value={(value && value[comp.name]) || ''}
                            onChange={(e) => onChange({ ...value, [comp.name]: e.target.value })}
                            className="w-full px-2.5 py-1.5 bg-black/40 border border-white/10 rounded-lg text-xs text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-purple-500/50 font-mono"
                            placeholder={getPlaceholder(comp.type)}
                        />
                    )}
                </div>
            ))}
        </div>
    );
}

export function TupleFieldInput({ input, value, onChange }: TupleFieldInputProps) {
    const components = input.components || [];
    const isTupleArray = input.type === 'tuple[]';

    if (isTupleArray) {
        const items = (Array.isArray(value) ? value : []) as Record<string, any>[];

        const addItem = () => {
            const empty: Record<string, any> = {};
            components.forEach(c => { empty[c.name] = ''; });
            onChange([...items, empty]);
        };

        const removeItem = (index: number) => {
            onChange(items.filter((_, i) => i !== index));
        };

        const updateItem = (index: number, newVal: Record<string, any>) => {
            const updated = [...items];
            updated[index] = newVal;
            onChange(updated);
        };

        return (
            <div className="space-y-2">
                {items.map((item, idx) => (
                    <div key={idx} className="bg-black/20 rounded-lg p-3 border border-white/5">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-gray-500 font-mono">[{idx}]</span>
                            <button
                                type="button"
                                onClick={() => removeItem(idx)}
                                className="text-red-400/60 hover:text-red-400 transition-colors p-0.5"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                        </div>
                        <TupleFields
                            components={components}
                            value={item}
                            onChange={(v) => updateItem(idx, v)}
                        />
                    </div>
                ))}
                <button
                    type="button"
                    onClick={addItem}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 rounded-lg transition-colors border border-dashed border-purple-500/20"
                >
                    <Plus className="w-3.5 h-3.5" />
                    Add entry
                </button>
            </div>
        );
    }

    // Single tuple
    return (
        <TupleFields
            components={components}
            value={value || {}}
            onChange={onChange}
        />
    );
}
