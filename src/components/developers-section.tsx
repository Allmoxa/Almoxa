import { motion } from "framer-motion";
import { Github, Instagram, Linkedin } from "lucide-react";
import { forwardRef } from "react";
import { useTeamParallax } from "@/hooks/use-team-parallax";

type SocialLink = {
  label: string;
  href: string;
  icon: typeof Github;
};

type Developer = {
  name: string;
  role: string;
  bio: string;
  photo: string;
  links: SocialLink[];
};

const developers: Developer[] = [
  {
    name: "Ricardo Real",
    role: "Full-stack",
    bio: "Estudante de Ciência da Computação e Engenharia de Software",
    photo: "/team/ricardo.webp",
    links: [
      { label: "GitHub", href: "https://github.com/RicardoRealDev", icon: Github },
      { label: "Instagram", href: "https://instagram.com/ric.castroreal", icon: Instagram },
      { label: "LinkedIn", href: "https://www.linkedin.com/in/ricardo-real/", icon: Linkedin },
    ],
  },
  {
    name: "Gabriel Rodrigues",
    role: "Full-stack",
    bio: "Estudante de Engenharia de Software",
    photo: "/team/gabriel.webp",
    links: [
      { label: "GitHub", href: "https://github.com/GabaDevPro", icon: Github },
      { label: "Instagram", href: "https://www.instagram.com/rodrigues.gabba/", icon: Instagram },
    ],
  },
];

/**
 * Tira de fita de embalagem. Puramente decorativa — className controla
 * tamanho, posição e rotação de cada uso. forwardRef porque o parallax de
 * "Quem fez" precisa de um handle direto pra cada fita.
 */
const TapeStrip = forwardRef<HTMLSpanElement, { className: string }>(function TapeStrip(
  { className },
  ref,
) {
  return (
    <span
      ref={ref}
      aria-hidden="true"
      className={`pointer-events-none absolute bg-[#EFE3CB]/90 shadow-[0_2px_8px_rgba(0,0,0,0.4)] ${className}`}
    />
  );
});

export function DevelopersSection() {
  const {
    sectionRef,
    titleGroupRef,
    card1Ref,
    card2Ref,
    card1TapeRef,
    card2TapeRef,
    setCornerTapeRef,
  } = useTeamParallax();

  return (
    <section
      ref={sectionRef}
      id="quem-fez"
      className="theme-box relative left-1/2 right-1/2 -mx-[50vw] w-screen rounded-[2.5rem] bg-background"
    >
      <TapeStrip
        ref={setCornerTapeRef(0)}
        className="-top-6 left-10 h-14 w-28 -rotate-45 sm:left-20"
      />
      <TapeStrip
        ref={setCornerTapeRef(1)}
        className="-top-6 right-10 h-14 w-28 rotate-45 sm:right-20"
      />
      <TapeStrip
        ref={setCornerTapeRef(2)}
        className="-bottom-6 left-10 h-14 w-28 -rotate-45 sm:left-20"
      />
      <TapeStrip
        ref={setCornerTapeRef(3)}
        className="-bottom-6 right-10 h-14 w-28 rotate-45 sm:right-20"
      />

      <div className="mx-auto max-w-5xl px-6 py-24">
        <div ref={titleGroupRef} style={{ willChange: "transform" }}>
          <p className="label-caps">Quem fez</p>
          <h2 className="mt-4 max-w-xl font-display text-4xl leading-[1.05] text-foreground sm:text-5xl">
            Feito por quem também vive de estoque e planilha.
          </h2>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          {developers.map((dev, i) => (
            <div
              key={dev.name}
              ref={i === 0 ? card1Ref : card2Ref}
              style={{ willChange: "transform" }}
            >
              <motion.div
                className="paper-panel relative flex h-full items-center gap-5 p-6"
                whileHover={{ y: -4 }}
              >
                <TapeStrip
                  ref={i === 0 ? card1TapeRef : card2TapeRef}
                  className={`-top-4 left-1/2 h-9 w-20 -translate-x-1/2 ${i % 2 === 0 ? "-rotate-2" : "rotate-2"}`}
                />
                <img
                  src={dev.photo}
                  alt={dev.name}
                  className="size-20 shrink-0 rounded-full border border-border object-cover"
                />
                <div>
                  <p className="font-display text-xl text-foreground">{dev.name}</p>
                  <p className="text-sm text-muted-foreground">{dev.role}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground/80">{dev.bio}</p>
                  <div className="mt-3 flex gap-3">
                    {dev.links.map((link) => (
                      <motion.a
                        key={link.label}
                        href={link.href}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`${dev.name} no ${link.label}`}
                        className="text-muted-foreground transition-colors hover:text-foreground"
                        whileHover={{ scale: 1.15 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        <link.icon className="size-5" />
                      </motion.a>
                    ))}
                  </div>
                </div>
              </motion.div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
