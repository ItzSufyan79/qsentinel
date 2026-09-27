import { useFlow } from "../state/flowStore";
import { Banner, Caption, Panel, SectionHead, Tooltip } from "../components/ui/atoms";
import { Icon } from "../components/ui/Icon";
import { BitRow } from "../components/viz/BitRow";

export function Page2Sign() {
  const store = useFlow();
  const signature = store.signature;
  const signed = store.signStage === "done" && signature !== null;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 sm:px-6">
      <div>
        <SectionHead step="1" title="Message" state="active" />
        <Panel>
          <label className="block">
            <span className="micro mb-2 block">Message to sign</span>
            <textarea
              value={store.message}
              onChange={(e) => store.setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && store.message.trim()) {
                  void store.signMessage();
                }
              }}
              placeholder="Type your message here…"
              rows={3}
              disabled={store.signStage === "running"}
              className="w-full resize-y border border-outline-strong bg-surface px-3.5 py-3 text-[15px] text-on-bg placeholder:text-n-500 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
            />
          </label>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <span className="num text-[11px] font-semibold text-n-500">
              {store.message.length} char{store.message.length === 1 ? "" : "s"} · ⌘⏎ to sign
            </span>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!store.message.trim() || store.signStage === "running"}
              onClick={() => void store.signMessage()}
            >
              <Icon name="zap" size={15} />
              {store.signStage === "running" ? "Signing…" : "Sign Message"}
            </button>
          </div>
        </Panel>
        <Caption id="p2-encode" className="mt-3" />
      </div>

      <div>
        <SectionHead
          step="2"
          title="Encoding"
          state={signed ? "done" : store.signStage === "running" ? "active" : "pending"}
        />

        {store.signStage === "idle" && !signature && (
          <Panel muted>
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <span className="grid size-10 place-items-center border border-dashed border-outline-strong text-n-500">
                <Icon name="layers" size={20} />
              </span>
              <p className="max-w-xs text-[13.5px] text-n-500">
                Enter a message and press <strong>Sign Message</strong> to see it encoded.
              </p>
            </div>
          </Panel>
        )}

        {store.signStage === "running" && (
          <Panel muted>
            <div className="flex items-center gap-3 py-6">
              <span className="block size-3 animate-spin border-2 border-n-300 border-t-primary" />
              <p className="micro">computing protected format…</p>
            </div>
          </Panel>
        )}

        {signature && (
          <Panel>
            <BitRow encoded={signature.encoded} />
          </Panel>
        )}
      </div>

      {signature && (
        <div className="animate-fade-up">
          <SectionHead step="3" title="Signature Packet" state="active" />
          <Panel>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              <Row label="Message" value={signature.message} />
              <Row label="Encoded length" value={`${signature.encodedLength} bits`} mono />
              <Row label="Blocks opened" value={`${signature.blocksOpened}`} mono />
              <Row label="Signature ID" value={signature.signatureId} mono />
              <div className="sm:col-span-2">
                <Row
                  label="Sent to"
                  value={`${signature.sentTo.join(", ")} (${signature.sentTo.length} verifier${signature.sentTo.length === 1 ? "" : "s"})`}
                />
              </div>
            </dl>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <Tooltip content="The packet proves authenticity and carries no secret key material.">
                <span className="micro inline-flex items-center gap-1.5">
                  <Icon name="lock" size={13} />
                  No secrets in the packet
                </span>
              </Tooltip>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => store.goToPage(3)}
              >
                Next: Choose Attack Scenario
                <Icon name="chevronRight" size={16} />
              </button>
            </div>
          </Panel>

          <Banner tone="brand" title="Ready for the attack simulator" className="mt-4">
            Pick whether an attacker interferes with this signature on the way to the
            verifiers.
          </Banner>
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="micro">{label}</dt>
      <dd
        className={`mt-1 text-[13.5px] break-words text-on-bg ${mono ? "num font-semibold" : "font-medium"}`}
      >
        {value}
      </dd>
    </div>
  );
}
