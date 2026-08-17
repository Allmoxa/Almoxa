import { useEffect } from "react";
import AOS from "aos";
import "aos/dist/aos.css";

export function AosInit() {
  useEffect(() => {
    AOS.init({ duration: 700, easing: "ease-out-cubic", once: true, offset: 40 });

    // A troca de fonte web pode mudar a altura do texto depois do cálculo
    // inicial de posições; sem isso o trigger pode ficar com a medida errada.
    document.fonts?.ready.then(() => AOS.refresh());
  }, []);

  return null;
}
