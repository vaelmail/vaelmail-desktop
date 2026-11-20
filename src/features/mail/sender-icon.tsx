import { useState } from "react";
import {
  AmazonLogoIcon,
  AppleLogoIcon,
  DiscordLogoIcon,
  FigmaLogoIcon,
  GithubLogoIcon,
  GoogleLogoIcon,
  InstagramLogoIcon,
  MicrosoftOutlookLogoIcon,
  NotionLogoIcon,
  PaypalLogoIcon,
  RedditLogoIcon,
  SlackLogoIcon,
  SpotifyLogoIcon,
  StripeLogoIcon,
  TiktokLogoIcon,
  XLogoIcon,
  YoutubeLogoIcon,
  type Icon,
} from "@phosphor-icons/react";
import { initials, type Recipient } from "@/lib/mail/types";
import { useMail } from "@/features/mailbox/context";

const services: { domains: string[]; icon: Icon; tone: string }[] = [
  {
    domains: ["github.com", "github.email"],
    icon: GithubLogoIcon,
    tone: "neutral",
  },
  {
    domains: ["google.com", "accounts.google.com"],
    icon: GoogleLogoIcon,
    tone: "blue",
  },
  { domains: ["instagram.com", "mail.instagram.com"], icon: InstagramLogoIcon, tone: "rose" },
  { domains: ["reddit.com", "redditmail.com"], icon: RedditLogoIcon, tone: "brass" },
  { domains: ["tiktok.com"], icon: TiktokLogoIcon, tone: "neutral" },
  { domains: ["x.com", "twitter.com"], icon: XLogoIcon, tone: "neutral" },
  { domains: ["youtube.com"], icon: YoutubeLogoIcon, tone: "rose" },
  { domains: ["stripe.com"], icon: StripeLogoIcon, tone: "violet" },
  {
    domains: ["notion.so", "notion.com", "makenotion.com"],
    icon: NotionLogoIcon,
    tone: "neutral",
  },
  {
    domains: ["slack.com", "slack-mail.com"],
    icon: SlackLogoIcon,
    tone: "rose",
  },
  {
    domains: ["discord.com", "discordapp.com"],
    icon: DiscordLogoIcon,
    tone: "violet",
  },
  { domains: ["figma.com"], icon: FigmaLogoIcon, tone: "rose" },
  {
    domains: ["amazon.com", "amazon.de", "amazon.co.uk", "amazon.fr"],
    icon: AmazonLogoIcon,
    tone: "brass",
  },
  {
    domains: ["apple.com", "email.apple.com"],
    icon: AppleLogoIcon,
    tone: "neutral",
  },
  { domains: ["spotify.com"], icon: SpotifyLogoIcon, tone: "sage" },
  { domains: ["paypal.com"], icon: PaypalLogoIcon, tone: "blue" },
  {
    domains: ["microsoft.com", "accountprotection.microsoft.com", "outlook.com"],
    icon: MicrosoftOutlookLogoIcon,
    tone: "blue",
  },
];
export function SenderIcon({
  sender,
  messageId,
  serviceId,
}: {
  sender: Recipient;
  messageId?: string;
  serviceId?: string;
}) {
  const { data } = useMail();
  const [loaded, setLoaded] = useState("");
  const source =
    data.mailbox.settings.favicons && (messageId || serviceId)
      ? "/api/webmail/sender-icon?" + (serviceId ? "service=" + serviceId : "message=" + messageId)
      : "";
  const domain = sender.email.split("@").at(-1)?.toLowerCase() || "";
  const service = services.find(({ domains }) =>
    domains.some((host) => domain === host || domain.endsWith("." + host)),
  );
  const Logo = service?.icon;
  return (
    <span className={"wm-sender-icon " + (service?.tone || "monogram")} aria-hidden="true">
      {source && (
        <img
          key={source}
          src={source}
          alt=""
          referrerPolicy="no-referrer"
          onLoad={() => setLoaded(source)}
          className={loaded === source ? "loaded" : ""}
        />
      )}
      {Logo ? (
        <Logo size={19} weight="regular" />
      ) : (
        initials(sender.name || domain.split(".")[0] || sender.email || "draft")
      )}
    </span>
  );
}
