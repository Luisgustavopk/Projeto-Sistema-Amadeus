import asyncio


async def await_inference(task):
    """Keep ownership even if the HTTP coroutine is canceled repeatedly."""
    try:
        return await asyncio.shield(task)
    except asyncio.CancelledError:
        while not task.done():
            try:
                await asyncio.shield(task)
            except asyncio.CancelledError:
                continue
            except Exception:  # noqa: BLE001 - preserve cancellation after any engine failure
                break
        if not task.cancelled():
            task.exception()  # retrieve a failure without replacing cancellation
        raise
