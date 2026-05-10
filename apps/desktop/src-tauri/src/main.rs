use serde::Serialize;
use std::net::{SocketAddr, TcpStream};
#[cfg(unix)]
use std::os::unix::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;
use tauri::State;

const APP_SERVER_URL: &str = "ws://127.0.0.1:4500";
const APP_SERVER_PORT: &str = "127.0.0.1:4500";
const BROKER_PORT: &str = "127.0.0.1:17333";

#[derive(Default)]
struct EngineProcesses {
    app_server: Option<Child>,
    broker: Option<Child>,
}

type EngineState = Mutex<EngineProcesses>;

#[derive(Serialize)]
struct EngineStatus {
    app_server_running: bool,
    broker_running: bool,
    app_server_managed: bool,
    broker_managed: bool,
    message: String,
}

#[tauri::command]
fn engine_status(state: State<EngineState>) -> Result<EngineStatus, String> {
    status_with_message(&state, "상태를 확인했습니다.".to_string())
}

#[tauri::command]
fn start_engine(state: State<EngineState>) -> Result<EngineStatus, String> {
    let repo_root = find_repo_root()?;
    let mut processes = state.lock().map_err(|_| "engine state lock failed".to_string())?;

    if !is_port_open(APP_SERVER_PORT) && processes.app_server.is_none() {
        let child = shell_child(&format!("exec codex app-server --listen {}", shell_quote(APP_SERVER_URL)), &repo_root)
            .map_err(|error| format!("codex app-server 실행 실패: {error}"))?;

        processes.app_server = Some(child);
    }

    if !is_port_open(BROKER_PORT) && processes.broker.is_none() {
        let child = shell_child("exec pnpm --filter @codex-spark/broker dev", &repo_root)
            .map_err(|error| format!("Broker 개발 서버 실행 실패: {error}"))?;

        processes.broker = Some(child);
    }

    drop(processes);
    std::thread::sleep(Duration::from_millis(900));
    status_with_message(&state, "엔진 시작 요청을 보냈습니다.".to_string())
}

#[tauri::command]
fn stop_engine(state: State<EngineState>) -> Result<EngineStatus, String> {
    let mut processes = state.lock().map_err(|_| "engine state lock failed".to_string())?;

    if let Some(mut broker) = processes.broker.take() {
        stop_process_group(&mut broker);
        let _ = broker.wait();
    }

    if let Some(mut app_server) = processes.app_server.take() {
        stop_process_group(&mut app_server);
        let _ = app_server.wait();
    }

    drop(processes);
    std::thread::sleep(Duration::from_millis(350));
    status_with_message(&state, "Tauri가 시작한 엔진을 종료했습니다.".to_string())
}

fn status_with_message(state: &State<EngineState>, message: String) -> Result<EngineStatus, String> {
    let mut processes = state.lock().map_err(|_| "engine state lock failed".to_string())?;

    reap_finished(&mut processes.app_server);
    reap_finished(&mut processes.broker);

    Ok(EngineStatus {
        app_server_running: is_port_open(APP_SERVER_PORT),
        broker_running: is_port_open(BROKER_PORT),
        app_server_managed: processes.app_server.is_some(),
        broker_managed: processes.broker.is_some(),
        message,
    })
}

fn reap_finished(child: &mut Option<Child>) {
    if let Some(process) = child.as_mut() {
        if matches!(process.try_wait(), Ok(Some(_))) {
            *child = None;
        }
    }
}

fn is_port_open(address: &str) -> bool {
    let Ok(socket_addr) = address.parse::<SocketAddr>() else {
        return false;
    };

    TcpStream::connect_timeout(&socket_addr, Duration::from_millis(180)).is_ok()
}

fn shell_child(command: &str, cwd: &Path) -> std::io::Result<Child> {
    let bootstrapped_command = format!(
        "if [ -f \"$HOME/.zshrc\" ]; then source \"$HOME/.zshrc\" >/dev/null 2>&1 || true; fi; {command}"
    );

    let mut command = Command::new("/bin/zsh");

    command
        .args(["-lc", &bootstrapped_command])
        .current_dir(cwd)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    #[cfg(unix)]
    command.process_group(0);

    command.spawn()
}

fn stop_process_group(child: &mut Child) {
    #[cfg(unix)]
    {
        let process_group = format!("-{}", child.id());
        let _ = Command::new("/bin/kill").args(["-TERM", &process_group]).status();
        std::thread::sleep(Duration::from_millis(250));

        if !matches!(child.try_wait(), Ok(Some(_))) {
            let _ = Command::new("/bin/kill").args(["-KILL", &process_group]).status();
        }

        return;
    }

    #[cfg(not(unix))]
    {
        let _ = child.kill();
    }
}

fn shell_quote(value: impl AsRef<str>) -> String {
    format!("'{}'", value.as_ref().replace('\'', "'\\''"))
}

fn find_repo_root() -> Result<PathBuf, String> {
    if let Ok(configured_root) = std::env::var("CODEX_SPARK_REPO_ROOT") {
        let configured_path = PathBuf::from(configured_root);

        if let Some(root) = find_repo_root_from(&configured_path) {
            return Ok(root);
        }
    }

    let current_dir = std::env::current_dir().map_err(|error| format!("현재 경로 확인 실패: {error}"))?;

    if let Some(root) = find_repo_root_from(&current_dir) {
        return Ok(root);
    }

    let exe = std::env::current_exe().map_err(|error| format!("실행 파일 경로 확인 실패: {error}"))?;

    if let Some(parent) = exe.parent() {
        if let Some(root) = find_repo_root_from(parent) {
            return Ok(root);
        }
    }

    let build_manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));

    if let Some(root) = find_repo_root_from(&build_manifest_dir) {
        return Ok(root);
    }

    Err("프로젝트 루트를 찾을 수 없습니다. CODEX_SPARK_REPO_ROOT를 codex-spark-app 경로로 설정하거나, codex-spark-app 안에서 Tauri를 실행해야 합니다.".to_string())
}

fn find_repo_root_from(start: &Path) -> Option<PathBuf> {
    for candidate in start.ancestors() {
        if candidate.join("packages/broker/package.json").exists()
            && candidate.join("apps/desktop/package.json").exists()
        {
            return Some(candidate.to_path_buf());
        }
    }

    None
}

fn main() {
    tauri::Builder::default()
        .manage(Mutex::new(EngineProcesses::default()))
        .invoke_handler(tauri::generate_handler![engine_status, start_engine, stop_engine])
        .run(tauri::generate_context!())
        .expect("error while running Codex Spark App");
}
