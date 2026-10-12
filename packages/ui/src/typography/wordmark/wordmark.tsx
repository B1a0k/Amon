import { createUniqueId, type ComponentProps } from "solid-js"

export function Wordmark(
  props: Pick<ComponentProps<"svg">, "class"> & { fade?: boolean; muted?: boolean; outline?: boolean },
) {
  const mask = createUniqueId()
  const maskGradient = createUniqueId()

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 720 129"
      fill="none"
      classList={{
        [props.class ?? ""]: !!props.class,
        "overflow-visible [&_path]:[vector-effect:non-scaling-stroke]": props.outline,
      }}
    >
      <g fill-rule="evenodd" opacity={props.muted === false ? 1 : 0.6} class="[[data-color-scheme=dark]_&]:opacity-100">
        <g mask={props.fade === false ? undefined : `url(#${mask})`}>
          <g
            opacity={props.muted === false ? 1 : 0.16 * 0.7}
            fill={props.outline ? "none" : "currentColor"}
            stroke={props.outline ? "currentColor" : undefined}
            stroke-width={props.outline ? 1 : undefined}
          >
            <path
              pathLength={props.outline ? 1 : undefined}
              d="M70 8L136 120H105L92 94H48L35 120H4ZM70 41L57 69H83Z"
            />
            <path
              pathLength={props.outline ? 1 : undefined}
              d="M181 120V8H212L250 65L288 8H319V120H289V57L250 110L211 57V120Z"
            />
            <path
              pathLength={props.outline ? 1 : undefined}
              d="M381 8H499V120H381ZM411 36V92H469V36Z"
            />
            <path
              pathLength={props.outline ? 1 : undefined}
              d="M555 120V8H587L654 77V8H684V120H652L585 51V120Z"
            />
            <path
              pathLength={props.outline ? 1 : undefined}
              d=""
            />
            <path
              pathLength={props.outline ? 1 : undefined}
              d=""
            />
            <path
              pathLength={props.outline ? 1 : undefined}
              d=""
            />
            <path
              pathLength={props.outline ? 1 : undefined}
              d=""
            />
          </g>
        </g>
      </g>
      <defs>
        <mask id={mask} style="mask-type:alpha" maskUnits="userSpaceOnUse" x="0" y="0" width="720" height="129">
          <rect width="720" height="129" fill={`url(#${maskGradient})`} />
        </mask>
        <linearGradient id={maskGradient} x1="360" y1="68" x2="360" y2="129" gradientUnits="userSpaceOnUse">
          <stop stop-color="white" stop-opacity="0.7" />
          <stop offset="1" stop-color="white" stop-opacity="0" />
        </linearGradient>
      </defs>
    </svg>
  )
}
