import { Archivo } from "next/font/google";

/*
 * One family, the way a kit room has one label maker. latin-ext is not
 * optional: this league reads names like Valančiūnas and Motiejūnas, and a font
 * that falls back mid-word for the diacritics makes the board look broken.
 *
 * Shared so `global-error` can load the same face after it replaces the root
 * layout (Next's own docs: the file must define html, body, styles and fonts).
 */
export const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});
