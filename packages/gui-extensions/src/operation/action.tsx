import { Icon } from "@opencode/ui/icon"
import { IconButton } from "@opencode/ui/icon-button"
import type { IconName } from "@opencode/ui/icons/catalog"
import { Tooltip } from "@opencode/ui/tooltip"

export function Action(props: { icon: IconName; label: string; disabled?: boolean; run: () => void }) {
  return (
    <Tooltip value={props.label} placement="bottom">
      <IconButton
        type="button"
        variant="ghost-muted"
        size="normal"
        aria-label={props.label}
        disabled={props.disabled}
        icon={<Icon name={props.icon} size="normal" />}
        onClick={props.run}
      />
    </Tooltip>
  )
}
