import { motion, type Variants } from "framer-motion";
import { Github, Instagram, Linkedin } from "lucide-react";
import type { ReactNode } from "react";

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

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 32 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: i * 0.12 },
  }),
};

/**
 * Tira de fita de embalagem de verdade (foto, fundo já transparente).
 * Puramente decorativa — className controla tamanho e posição de cada uso;
 * flip espelha horizontalmente pra fita "ir" pro outro lado.
 */
function TapeStrip({ className, flip }: { className: string; flip?: boolean }) {
  return (
    <img
      src="/tape/tape-strip.webp"
      alt=""
      aria-hidden="true"
      className={`pointer-events-none absolute select-none drop-shadow-[0_4px_10px_rgba(0,0,0,0.35)] ${
        flip ? "-scale-x-100" : ""
      } ${className}`}
    />
  );
}

export function DevelopersSection({ children }: { children?: ReactNode }) {
  return (
    <section className="theme-box relative left-1/2 right-1/2 -mx-[50vw] w-screen rounded-t-[2.5rem] bg-background">
      <TapeStrip className="-top-8 left-6 w-28 sm:left-16 sm:w-32" />
      <TapeStrip className="-top-8 right-6 w-28 sm:right-16 sm:w-32" flip />

      <div className="mx-auto max-w-5xl px-6 py-24">
        <motion.p
          className="label-caps"
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ duration: 0.5 }}
        >
          Quem fez
        </motion.p>
        <motion.h2
          className="mt-4 max-w-xl font-display text-4xl leading-[1.05] text-foreground sm:text-5xl"
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ duration: 0.5, delay: 0.05 }}
        >
          Feito por quem também vive de estoque e planilha.
        </motion.h2>

        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          {developers.map((dev, i) => (
            <motion.div
              key={dev.name}
              className="paper-panel relative flex items-center gap-5 p-6"
              custom={i}
              variants={cardVariants}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, amount: 0.4 }}
              whileHover={{ y: -4 }}
            >
              <TapeStrip className="-top-5 left-1/2 w-20 -translate-x-1/2" flip={i % 2 === 1} />
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
          ))}
        </div>

        {children ? (
          <div className="rule-top relative mt-16 pt-8">
            <TapeStrip className="-top-5 left-6 w-16 sm:left-12" />
            <TapeStrip className="-top-5 right-6 w-16 sm:right-12" flip />
            {children}
          </div>
        ) : null}
      </div>
    </section>
  );
}
