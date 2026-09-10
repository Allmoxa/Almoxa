import { Link } from "@tanstack/react-router";

// Ordem do dia do prestador: ver o que vem, o que ele oferece, quando atende,
// e por onde o cliente chega.
const abas = [
  { to: "/agenda", label: "Agenda" },
  { to: "/agenda/servicos", label: "Serviços" },
  { to: "/agenda/disponibilidade", label: "Quando atendo" },
  { to: "/agenda/link", label: "Seu link" },
] as const;

/**
 * Navegação entre as quatro telas do prestador.
 *
 * A Agenda entra no Almoxá como uma aba só na barra de cima — oito abas lá
 * não caberiam —, então a divisão interna dela vive aqui dentro da página.
 * O desenho é o mesmo do par "Próximos/Passados" da tela de agenda, que já
 * existia: sub-navegação dentro de uma tela não deve imitar a barra principal,
 * ou as duas competem pela mesma leitura.
 *
 * `rolagem lateral` no celular em vez de quebrar em duas linhas: quatro
 * rótulos não cabem em 375px, e empilhar empurraria o conteúdo da tela para
 * baixo da dobra.
 */
export function AgendaTabs() {
  return (
    <div
      className="-mx-4 mb-8 overflow-x-auto px-4 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      role="tablist"
      aria-label="Seções da agenda"
    >
      <div className="flex w-max gap-1 rounded-md bg-muted p-1 sm:w-auto">
        {abas.map((aba) => (
          <Link
            key={aba.to}
            to={aba.to}
            role="tab"
            // `exact` na raiz: sem isso /agenda ficaria ativa junto com as
            // filhas, e duas abas apareceriam selecionadas ao mesmo tempo.
            // Espalhado em vez de ternario com undefined: o projeto roda com
            // exactOptionalPropertyTypes, que recusa `undefined` explicito.
            {...(aba.to === "/agenda" ? { activeOptions: { exact: true } } : {})}
            className="min-h-9 shrink-0 rounded-sm px-3.5 py-1.5 text-sm whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground"
            activeProps={{
              className: "bg-card font-medium text-foreground shadow-paper",
              "aria-selected": true,
            }}
            inactiveProps={{ "aria-selected": false }}
          >
            {aba.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
