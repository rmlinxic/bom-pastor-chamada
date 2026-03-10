/**
 * Input de senha com medidor de força e toggle show/hide.
 */
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { checkPasswordStrength } from "@/lib/security";
import { cn } from "@/lib/utils";

interface PasswordInputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  showStrength?: boolean;
  className?: string;
  disabled?: boolean;
  autoComplete?: string;
}

export default function PasswordInput({
  value,
  onChange,
  placeholder = "Senha",
  showStrength = false,
  className,
  disabled,
  autoComplete = "current-password",
}: PasswordInputProps) {
  const [show, setShow] = useState(false);
  const strength = showStrength && value ? checkPasswordStrength(value) : null;

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete={autoComplete}
          maxLength={128}
          className={cn("pr-10", className)}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setShow((p) => !p)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          aria-label={show ? "Ocultar senha" : "Mostrar senha"}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>

      {strength && (
        <div className="space-y-1">
          {/* Barra de força */}
          <div className="flex gap-1">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={cn(
                  "h-1 flex-1 rounded-full transition-colors",
                  i < strength.score
                    ? strength.score <= 1 ? "bg-destructive"
                      : strength.score <= 2 ? "bg-warning"
                      : "bg-success"
                    : "bg-muted"
                )}
              />
            ))}
          </div>
          <div className="flex items-center justify-between">
            <span className={cn("text-xs font-medium", strength.color)}>{strength.label}</span>
            {strength.suggestions[0] && (
              <span className="text-xs text-muted-foreground">{strength.suggestions[0]}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
