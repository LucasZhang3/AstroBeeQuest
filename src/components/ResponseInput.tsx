import { useRef, useEffect } from "react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface ResponseInputProps {
  value: string;
  onChange: (value: string) => void;
  characterLimit: number;
}

export function ResponseInput({ value, onChange, characterLimit }: ResponseInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const charactersRemaining = characterLimit - value.length;
  const isNearLimit = charactersRemaining <= 50;
  const isAtLimit = charactersRemaining <= 0;

  // Auto-resize without resetting cursor
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "52px";
    const newHeight = Math.max(52, Math.min(textarea.scrollHeight, 200));
    textarea.style.height = `${newHeight}px`;
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    if (newValue.length <= characterLimit) {
      onChange(newValue);
    }
  };

  return (
    <div className="w-full py-2">
      <div className="relative max-w-xl w-full mx-auto">
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          placeholder="Share your thoughts..."
          className="max-w-xl bg-white/10 w-full rounded-3xl pl-4 pr-4 py-3 placeholder:text-white/30 border border-white/10 focus-visible:ring-0 focus-visible:ring-offset-0 text-white resize-none leading-[1.4]"
          style={{
            overflow: "auto",
            minHeight: "52px",
            maxHeight: "200px",
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
            }
          }}
        />
      </div>

      <div className="flex justify-end mt-2 max-w-xl mx-auto px-2">
        <span
          className={cn(
            "text-xs",
            isAtLimit ? "text-red-400" : isNearLimit ? "text-yellow-400" : "text-white/30"
          )}
        >
          {charactersRemaining} characters remaining
        </span>
      </div>
    </div>
  );
}
