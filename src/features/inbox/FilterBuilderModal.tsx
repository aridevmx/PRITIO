import { useState } from "react";
import { createPortal } from "react-dom";
import { AppIcon } from "@/components/AppIcon";
import { X, Plus, Trash, Funnel } from "@phosphor-icons/react";
import { useWorkspace } from "@/features/workspaces/WorkspaceProvider";
import { createUserFilter, type FilterCondition, type FilterAction } from "@/features/inbox/filtersApi";
import { QUADRANTS, QUADRANT_ORDER } from "@/features/tasks/quadrants";

interface FilterBuilderModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const CONDITION_TYPES = [
  { value: "quadrant", label: "Cuadrante" },
  { value: "overdue", label: "Atrasada" },
  { value: "myDay", label: "En Mi día" },
  { value: "completed", label: "Completada" },
  { value: "project", label: "Proyecto" },
  { value: "workspace", label: "Workspace" },
];

const ACTION_TYPES = [
  { value: "moveToQuadrant", label: "Mover a cuadrante" },
  { value: "addToMyDay", label: "Agregar a Mi día" },
  { value: "archive", label: "Archivar" },
];

export function FilterBuilderModal({ open, onClose, onCreated }: FilterBuilderModalProps) {
  const { profile } = useWorkspace();
  const { workspaces } = useWorkspace();
  const [name, setName] = useState("");
  const [conditions, setConditions] = useState<FilterCondition[]>([{ type: "quadrant", value: "do" }]);
  const [actions, setActions] = useState<FilterAction[]>([{ type: "moveToQuadrant", value: "do" }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const addCondition = () => {
    setConditions([...conditions, { type: "quadrant", value: "do" }]);
  };

  const removeCondition = (index: number) => {
    if (conditions.length <= 1) return;
    setConditions(conditions.filter((_, i) => i !== index));
  };

  const updateCondition = (index: number, updates: Partial<FilterCondition>) => {
    setConditions(conditions.map((c, i) => (i === index ? { ...c, ...updates } : c)));
  };

  const addAction = () => {
    setActions([...actions, { type: "moveToQuadrant", value: "do" }]);
  };

  const removeAction = (index: number) => {
    if (actions.length <= 1) return;
    setActions(actions.filter((_, i) => i !== index));
  };

  const updateAction = (index: number, updates: Partial<FilterAction>) => {
    setActions(actions.map((a, i) => (i === index ? { ...a, ...updates } : a)));
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError("El nombre es requerido");
      return;
    }
    if (!profile?.id) {
      setError("No se pudo obtener el usuario");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createUserFilter(profile.id, name.trim(), conditions, actions);
      onCreated();
      onClose();
      // Reset form
      setName("");
      setConditions([{ type: "quadrant", value: "do" }]);
      setActions([{ type: "moveToQuadrant", value: "do" }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear filtro");
    } finally {
      setSaving(false);
    }
  };

  const renderConditionValue = (condition: FilterCondition, index: number) => {
    switch (condition.type) {
      case "quadrant":
        return (
          <select
            value={condition.value as string}
            onChange={(e) => updateCondition(index, { value: e.target.value })}
            className="rounded-lg border border-line bg-surface-subtle px-3 py-1.5 text-sm text-ink outline-none focus:border-pritio-blue"
          >
            {QUADRANT_ORDER.map((q) => (
              <option key={q} value={q}>
                {QUADRANTS[q]?.title ?? q}
              </option>
            ))}
          </select>
        );
      case "overdue":
      case "myDay":
      case "completed":
        return (
          <select
            value={String(condition.value)}
            onChange={(e) => updateCondition(index, { value: e.target.value === "true" })}
            className="rounded-lg border border-line bg-surface-subtle px-3 py-1.5 text-sm text-ink outline-none focus:border-pritio-blue"
          >
            <option value="true">Sí</option>
            <option value="false">No</option>
          </select>
        );
      case "project":
        return (
          <select
            value={condition.value as string}
            onChange={(e) => updateCondition(index, { value: e.target.value })}
            className="rounded-lg border border-line bg-surface-subtle px-3 py-1.5 text-sm text-ink outline-none focus:border-pritio-blue"
          >
            <option value="">Sin proyecto</option>
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        );
      case "workspace":
        return (
          <select
            value={condition.value as string}
            onChange={(e) => updateCondition(index, { value: e.target.value })}
            className="rounded-lg border border-line bg-surface-subtle px-3 py-1.5 text-sm text-ink outline-none focus:border-pritio-blue"
          >
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        );
      default:
        return null;
    }
  };

  const renderActionValue = (action: FilterAction, index: number) => {
    switch (action.type) {
      case "moveToQuadrant":
        return (
          <select
            value={action.value as string}
            onChange={(e) => updateAction(index, { value: e.target.value })}
            className="rounded-lg border border-line bg-surface-subtle px-3 py-1.5 text-sm text-ink outline-none focus:border-pritio-blue"
          >
            {QUADRANT_ORDER.map((q) => (
              <option key={q} value={q}>
                {QUADRANTS[q]?.title ?? q}
              </option>
            ))}
          </select>
        );
      default:
        return null;
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-ink/30 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="pritio-modal-enter mx-4 w-full max-w-lg rounded-2xl bg-surface p-6 shadow-elevated max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-ink flex items-center gap-2">
            <AppIcon glyph={Funnel} />
            Crear filtro
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-muted hover:text-ink transition-colors"
          >
            <AppIcon glyph={X} />
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">
            {error}
          </div>
        )}

        {/* Filter Name */}
        <div className="mb-4">
          <label className="mb-1.5 block text-xs font-medium text-ink-muted">Nombre del filtro</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej: Tareas urgentes de trabajo"
            className="w-full rounded-xl border border-line bg-surface-subtle px-3.5 py-2 text-sm text-ink outline-none placeholder:text-ink-muted focus:border-pritio-blue focus:ring-1 focus:ring-pritio-blue/20"
          />
        </div>

        {/* Conditions */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold uppercase tracking-wider text-ink-muted">Condiciones (SI)</p>
            <button
              type="button"
              onClick={addCondition}
              className="flex items-center gap-1 text-xs font-semibold text-pritio-blue hover:underline"
            >
              <AppIcon glyph={Plus} size="xs" />
              Agregar
            </button>
          </div>
          <div className="space-y-2">
            {conditions.map((condition, index) => (
              <div key={index} className="flex items-center gap-2">
                <select
                  value={condition.type}
                  onChange={(e) => updateCondition(index, { type: e.target.value as FilterCondition["type"], value: undefined })}
                  className="rounded-lg border border-line bg-surface-subtle px-3 py-1.5 text-sm text-ink outline-none focus:border-pritio-blue"
                >
                  {CONDITION_TYPES.map((ct) => (
                    <option key={ct.value} value={ct.value}>
                      {ct.label}
                    </option>
                  ))}
                </select>
                {renderConditionValue(condition, index)}
                {conditions.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeCondition(index)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-muted hover:bg-red-50 hover:text-red-500 transition-colors"
                  >
                    <AppIcon glyph={Trash} size="sm" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold uppercase tracking-wider text-ink-muted">Acciones (ENTONCES)</p>
            <button
              type="button"
              onClick={addAction}
              className="flex items-center gap-1 text-xs font-semibold text-pritio-blue hover:underline"
            >
              <AppIcon glyph={Plus} size="xs" />
              Agregar
            </button>
          </div>
          <div className="space-y-2">
            {actions.map((action, index) => (
              <div key={index} className="flex items-center gap-2">
                <select
                  value={action.type}
                  onChange={(e) => updateAction(index, { type: e.target.value as FilterAction["type"], value: undefined })}
                  className="rounded-lg border border-line bg-surface-subtle px-3 py-1.5 text-sm text-ink outline-none focus:border-pritio-blue"
                >
                  {ACTION_TYPES.map((at) => (
                    <option key={at.value} value={at.value}>
                      {at.label}
                    </option>
                  ))}
                </select>
                {renderActionValue(action, index)}
                {actions.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeAction(index)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-muted hover:bg-red-50 hover:text-red-500 transition-colors"
                  >
                    <AppIcon glyph={Trash} size="sm" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-line px-4 py-2 text-sm font-semibold text-ink-soft hover:bg-surface-muted transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-ink/90 transition-colors disabled:opacity-50"
          >
            {saving ? "Guardando..." : "Crear filtro"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}