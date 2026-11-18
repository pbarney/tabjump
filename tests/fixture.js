/* Change a real tab title without changing its URL or injecting a script. */
const fixtureId = new URL(location.href).searchParams.get("id");
const channel = new BroadcastChannel("tabjump-lifecycle-fixtures");

channel.addEventListener("message", ({ data }) => {
  if (data?.id === fixtureId && typeof data.title === "string")
    document.title = data.title;
});

// Set the title after the listener is ready.
document.title = `TabJump fixture ${fixtureId}`;
