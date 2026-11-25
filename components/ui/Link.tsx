import { forwardRef, type AnchorHTMLAttributes } from "react";
import { Link as RouterLink } from "react-router";
import { prefetchRoute } from "@/lib/prefetch";

export interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  href: string;
  /** Replace the current history entry instead of pushing a new one. */
  replace?: boolean;
}

const EXTERNAL = /^([a-z][a-z\d+.-]*:|\/\/)/i; // http:, mailto:, tel:, protocol-relative

/**
 * App-wide link. In-app paths go through the client router (no full reload); external URLs,
 * same-page anchors ("#section") and new-tab links render a plain anchor.
 */
export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link({ href, replace, ...props }, ref) {
  if (EXTERNAL.test(href) || href.startsWith("#") || props.target === "_blank" || props.download !== undefined) {
    return <a ref={ref} href={href} {...props} />;
  }
  const { onPointerEnter, onFocus, onTouchStart } = props;
  return (
    <RouterLink
      ref={ref}
      to={href}
      replace={replace}
      {...props}
      // Load the destination's data on intent, so it's usually there by the time the click lands.
      onPointerEnter={(e) => {
        prefetchRoute(href);
        onPointerEnter?.(e);
      }}
      onFocus={(e) => {
        prefetchRoute(href);
        onFocus?.(e);
      }}
      onTouchStart={(e) => {
        prefetchRoute(href);
        onTouchStart?.(e);
      }}
    />
  );
});
