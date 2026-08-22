import { cn } from "@/lib/utils";

const SIZES = { sm: 28, md: 44, lg: 80 } as const;

export function QuillMascot({
  mood = "idle",
  size = "md",
  className,
}: {
  mood?: "idle" | "thinking" | "happy";
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const px = SIZES[size];
  return (
    <svg
      className={cn("quill-mascot", className)}
      data-mood={mood}
      width={px}
      height={px}
      viewBox="0 0 64 64"
      fill="none"
      role="img"
      aria-label="Quill"
    >
      <style>{`
        .quill-mascot .qm-character { transform-origin: 31px 50px; animation: qm-float 3.2s ease-in-out infinite; }
        .quill-mascot .qm-eyes { transform-origin: 30px 31px; animation: qm-blink 4.6s ease-in-out infinite; }
        .quill-mascot .qm-feather { transform-origin: 39px 45px; }
        .quill-mascot[data-mood="thinking"] .qm-feather { animation: qm-write .7s ease-in-out infinite; }
        .quill-mascot[data-mood="happy"] .qm-character { animation-duration: 1.7s; }
        @keyframes qm-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-2px); }
        }
        @keyframes qm-blink {
          0%, 91%, 100% { transform: scaleY(1); }
          94% { transform: scaleY(.12); }
        }
        @keyframes qm-write {
          0%, 100% { transform: rotate(-4deg); }
          50% { transform: rotate(5deg) translateY(1px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .quill-mascot .qm-character,
          .quill-mascot .qm-eyes,
          .quill-mascot .qm-feather { animation: none !important; }
        }
      `}</style>
      <ellipse cx="31" cy="54" rx="14" ry="2.5" fill="var(--primary)" opacity=".12" />
      <g className="qm-character">
        <path
          d="M20 9h17l10 10v27a7 7 0 0 1-7 7H20a7 7 0 0 1-7-7V16a7 7 0 0 1 7-7Z"
          fill="var(--card)"
          stroke="var(--primary)"
          strokeWidth="2.25"
          strokeLinejoin="round"
        />
        <path
          d="M37 9v8a3 3 0 0 0 3 3h7"
          fill="color-mix(in oklch, var(--primary) 18%, var(--card))"
          stroke="var(--primary)"
          strokeWidth="2.25"
          strokeLinejoin="round"
        />
        <path d="M20 42c5 2 10 2 15 0" stroke="var(--border)" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M20 46h10" stroke="var(--border)" strokeWidth="1.5" strokeLinecap="round" />
        <g className="qm-eyes" fill="var(--foreground)">
          <circle cx="25" cy="30" r="1.7" />
          <circle cx="34" cy="30" r="1.7" />
        </g>
        <path
          d={mood === "happy" ? "M25 35c2.5 2.7 6.5 2.7 9 0" : "M27 35.5c1.4 1.2 3.6 1.2 5 0"}
          stroke="var(--primary)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <g className="qm-feather">
          <path
            d="M39 45c3-11 9-20 16-25-1 10-5 19-16 25Z"
            fill="var(--primary)"
          />
          <path
            d="M54 21 37 48"
            stroke="var(--primary-foreground)"
            strokeWidth="1.25"
            strokeLinecap="round"
          />
          <path d="m46 31 6-2M43 36l6-2M49 27l4-1" stroke="var(--primary-foreground)" strokeWidth="1" strokeLinecap="round" />
        </g>
      </g>
    </svg>
  );
}
