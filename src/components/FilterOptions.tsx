'use client';
import { ChevronDown } from 'lucide-react';
import { useEffect, useRef,useState } from 'react';

interface FilterOptionsProps {
  title: string;
  options: string[];
  selectedOptions: string[];
  onChange: (options: string[]) => void;
}

export default function FilterOptions({ title, options, selectedOptions, onChange }: FilterOptionsProps) {
  const [open, setOpen] = useState(false);
  const [popupStyles, setPopupStyles] = useState<React.CSSProperties>({});
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  const handleOptionClick = (option: string) => {
    if (selectedOptions.includes(option)) {
      onChange(selectedOptions.filter((o) => o !== option));
    } else {
      onChange([...selectedOptions, option]);
    }
  };

  // 计算弹窗位置，防止超出屏幕
  useEffect(() => {
    if (open && buttonRef.current && popupRef.current) {
      const btnRect = buttonRef.current.getBoundingClientRect();
      const popup = popupRef.current;
      const screenWidth = window.innerWidth;

      let left = btnRect.left;
      const top = btnRect.bottom + 4; // 下方间距
      const width = Math.min(screenWidth - 16, 400); // 弹窗最大宽度400，留一点边距

      // 如果右边超出屏幕，向左移动
      if (left + width > screenWidth - 8) {
        left = Math.max(8, screenWidth - width - 8);
      }

      setPopupStyles({ left, top, width });
    }
  }, [open]);

  return (
    <div className="relative inline-block mr-2 mb-2">
      <button
        ref={buttonRef}
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 px-3 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg text-sm font-medium hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
      >
        {title}
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : 'rotate-0'}`} />
      </button>

      {open && (
        <div
          ref={popupRef}
          style={popupStyles}
          className="
            fixed z-50
            bg-white dark:bg-gray-800
            border border-gray-200 dark:border-gray-700
            rounded-lg shadow-lg p-4
            max-h-[70vh] overflow-auto
          "
        >
          <div className="grid gap-2"
            style={{
              gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))'
            }}
          >
            {options.map((option) => (
              <button
                key={option}
                onClick={() => handleOptionClick(option)}
                className={`px-3 py-2 text-sm rounded-lg transition-all duration-200 text-left ${
                  selectedOptions.includes(option)
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border border-green-200 dark:border-green-700'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100/80 dark:hover:bg-gray-700/80'
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
