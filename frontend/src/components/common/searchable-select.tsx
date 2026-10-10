import { Check, ChevronsUpDown } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface SelectOption {
  value: string;
  label: string;
  /** Teks kecil di bawah label */
  hint?: string;
}

export interface OptionGroup {
  heading?: string;
  options: SelectOption[];
}

interface SearchableSelectProps {
  value?: string;
  onChange: (value: string) => void;
  options?: SelectOption[];
  /** Alternatif `options` dengan pengelompokan */
  groups?: OptionGroup[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
}

/** Dropdown dengan pencarian (combobox). */
export function SearchableSelect({
  value,
  onChange,
  options,
  groups,
  placeholder = "Pilih...",
  searchPlaceholder = "Cari...",
  emptyText = "Tidak ditemukan.",
  className,
  disabled,
  id,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const allGroups: OptionGroup[] = groups ?? [{ options: options ?? [] }];
  const selected = allGroups.flatMap((g) => g.options).find((o) => o.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-full justify-between font-normal", !selected && "text-muted-foreground", className)}
        >
          <span className="truncate">{selected?.label ?? placeholder}</span>
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            {allGroups.map((group, index) =>
              group.options.length === 0 ? null : (
                <CommandGroup key={group.heading ?? index} heading={group.heading}>
                  {group.options.map((option) => (
                    <CommandItem
                      key={option.value}
                      value={`${option.label} ${option.value}`}
                      onSelect={() => {
                        onChange(option.value);
                        setOpen(false);
                      }}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate">{option.label}</p>
                        {option.hint && <p className="truncate text-xs text-muted-foreground">{option.hint}</p>}
                      </div>
                      <Check className={cn("ml-auto", option.value === value ? "opacity-100" : "opacity-0")} />
                    </CommandItem>
                  ))}
                </CommandGroup>
              ),
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
