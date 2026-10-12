import { type ComponentProps } from "solid-js"

export const Mark = (props: { class?: string }) => {
  return (
    <svg
      data-component="logo-mark"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 16 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path data-slot="logo-logo-mark-shadow" d="M4 12H12V15H4Z" fill="var(--icon-weak-base)" />
      <path data-slot="logo-logo-mark-o" d="M8 0L16 20H12L8 9L4 20H0Z" fill="var(--icon-strong-base)" />
    </svg>
  )
}

export const Splash = (props: Pick<ComponentProps<"svg">, "ref" | "class">) => {
  return (
    <svg
      ref={props.ref}
      data-component="logo-splash"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 80 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M20 60H60V75H20Z" fill="var(--icon-base)" />
      <path d="M40 0L80 100H60L40 45L20 100H0Z" fill="var(--icon-strong-base)" />
    </svg>
  )
}

export const Logo = (props: { class?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 129" fill="var(--icon-strong-base)" fill-rule="evenodd" classList={{ [props.class ?? ""]: !!props.class }}>
    <path d="M70 8L136 120H105L92 94H48L35 120H4ZM70 41L57 69H83Z" />
    <path d="M181 120V8H212L250 65L288 8H319V120H289V57L250 110L211 57V120Z" />
    <path d="M381 8H499V120H381ZM411 36V92H469V36Z" />
    <path d="M555 120V8H587L654 77V8H684V120H652L585 51V120Z" />
  </svg>
)
