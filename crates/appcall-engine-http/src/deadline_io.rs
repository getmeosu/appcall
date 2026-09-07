use std::{
    future::Future,
    io,
    pin::Pin,
    task::{Context, Poll},
    time::Duration,
};
use tokio::{
    io::{AsyncRead, AsyncWrite, ReadBuf},
    time::Sleep,
};
/// Progress deadlines on each socket read/write, in addition to the absolute
/// header/body/request/connection deadlines enforced by the transport.
pub(crate) struct DeadlineIo<T> {
    inner: T,
    read: Duration,
    write: Duration,
    read_timer: Option<Pin<Box<Sleep>>>,
    write_timer: Option<Pin<Box<Sleep>>>,
}
impl<T> DeadlineIo<T> {
    pub(crate) fn new(inner: T, read: Duration, write: Duration) -> Self {
        Self {
            inner,
            read,
            write,
            read_timer: None,
            write_timer: None,
        }
    }
}
fn pending(
    timer: &mut Option<Pin<Box<Sleep>>>,
    timeout: Duration,
    cx: &mut Context<'_>,
) -> Poll<io::Result<()>> {
    let sleep = timer.get_or_insert_with(|| Box::pin(tokio::time::sleep(timeout)));
    if sleep.as_mut().poll(cx).is_ready() {
        Poll::Ready(Err(io::Error::new(
            io::ErrorKind::TimedOut,
            "socket deadline",
        )))
    } else {
        Poll::Pending
    }
}
impl<T: AsyncRead + Unpin> AsyncRead for DeadlineIo<T> {
    fn poll_read(
        self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &mut ReadBuf<'_>,
    ) -> Poll<io::Result<()>> {
        let this = self.get_mut();
        match Pin::new(&mut this.inner).poll_read(cx, buf) {
            Poll::Ready(result) => {
                this.read_timer = None;
                Poll::Ready(result)
            }
            Poll::Pending => pending(&mut this.read_timer, this.read, cx),
        }
    }
}
impl<T: AsyncWrite + Unpin> AsyncWrite for DeadlineIo<T> {
    fn poll_write(
        self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &[u8],
    ) -> Poll<io::Result<usize>> {
        let this = self.get_mut();
        match Pin::new(&mut this.inner).poll_write(cx, buf) {
            Poll::Ready(result) => {
                this.write_timer = None;
                Poll::Ready(result)
            }
            Poll::Pending => match pending(&mut this.write_timer, this.write, cx) {
                Poll::Ready(Err(error)) => Poll::Ready(Err(error)),
                _ => Poll::Pending,
            },
        }
    }
    fn poll_flush(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        let this = self.get_mut();
        match Pin::new(&mut this.inner).poll_flush(cx) {
            Poll::Ready(result) => {
                this.write_timer = None;
                Poll::Ready(result)
            }
            Poll::Pending => pending(&mut this.write_timer, this.write, cx),
        }
    }
    fn poll_shutdown(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        let this = self.get_mut();
        match Pin::new(&mut this.inner).poll_shutdown(cx) {
            Poll::Ready(result) => {
                this.write_timer = None;
                Poll::Ready(result)
            }
            Poll::Pending => pending(&mut this.write_timer, this.write, cx),
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    #[test]
    fn read_and_write_progress_deadlines_expire() {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        runtime.block_on(async {
            let (stream, _peer) = tokio::io::duplex(1);
            let mut socket =
                DeadlineIo::new(stream, Duration::from_millis(10), Duration::from_millis(10));
            assert_eq!(
                socket.read_exact(&mut [0u8; 1]).await.unwrap_err().kind(),
                io::ErrorKind::TimedOut
            );
            assert_eq!(
                socket.write_all(b"ab").await.unwrap_err().kind(),
                io::ErrorKind::TimedOut
            );
        });
    }
}
