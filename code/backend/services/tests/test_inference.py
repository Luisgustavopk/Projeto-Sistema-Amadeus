import asyncio
from threading import Event

import pytest

from speech_runtime.inference import await_inference


def test_repeated_cancellation_cannot_release_a_running_thread():
    entered, release = Event(), Event()

    def work():
        entered.set()
        assert release.wait(3)
        return "complete"

    async def exercise():
        task = asyncio.create_task(asyncio.to_thread(work))
        owner = asyncio.create_task(await_inference(task))
        try:
            assert await asyncio.to_thread(entered.wait, 2)
            owner.cancel()
            await asyncio.sleep(0)
            owner.cancel()
            await asyncio.sleep(0.01)
            assert not owner.done()
            assert not task.done()
        finally:
            release.set()
        with pytest.raises(asyncio.CancelledError):
            await owner
        assert task.result() == "complete"

    asyncio.run(exercise())
