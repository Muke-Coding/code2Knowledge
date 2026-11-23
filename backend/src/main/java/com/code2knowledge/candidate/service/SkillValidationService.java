package com.code2knowledge.candidate.service;

import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Profile;
import org.springframework.beans.factory.annotation.Value;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.code2knowledge.common.exception.ApiException;
import java.nio.file.*;
import java.nio.file.attribute.PosixFilePermissions;
import java.util.concurrent.TimeUnit;
import java.io.IOException;

/** 平台独立运行固定Skill纯契约校验器；不信任设备valid字段，10秒超时杀进程且不回显不可信stderr。 */
@Service
@Profile("platform")
public class SkillValidationService {
    /** 每JVM最多两个固定校验子进程；不排队，避免授权设备并发耗尽宿主内存，不跨企业锁持有。 */
    private static final java.util.concurrent.Semaphore CAPACITY = new java.util.concurrent.Semaphore(2);
    /** 管理员安装的Node可执行文件，不接收HTTP自定义命令。 */
    private final String node;
    /** 固定版本部署脚本绝对路径，不能由导入请求指定。 */
    private final Path script;
    /** 安全JSON解析器。 */
    private final ObjectMapper json;
    /**
     * @param node Node22绝对路径或管理员PATH命令
     * @param script 固定纯校验入口路径
     * @param json 平台解析器 */
    public SkillValidationService(@Value("${c2k.candidate.node:node}") String node, @Value("${c2k.candidate.validator:apps/runtime/dist/skill-inspect.js}") String script, ObjectMapper json) { this.node = node; this.script = Paths.get(script).toAbsolutePath(); this.json = json; }
    /**
     * @param archive 有界原始ZIP
     * @return 服务端重新计算的清单，不含正文
     * @throws IOException 暂存失败
     * @throws InterruptedException 服务停止时向调用方传播中断并拒绝
     * @throws ApiException 契约失败422、工具不可用或并发已满503 */
    public JsonNode validate(byte[] archive) throws IOException, InterruptedException {
        if (!CAPACITY.tryAcquire()) throw new ApiException(503, "VALIDATOR_BUSY", "校验器繁忙，请稍后沿用原请求ID重试");
        try { return validateWithinBudget(archive); } finally { CAPACITY.release(); }
    }
    /**
     * @param archive 已取得并发许可的有界ZIP
     * @return 固定校验清单
     * @throws IOException 暂存失败
     * @throws InterruptedException 等待子进程被中断；外层finally始终归还许可 */
    private JsonNode validateWithinBudget(byte[] archive) throws IOException, InterruptedException {
        Path directory = Files.createTempDirectory("c2k-server-validation-");
        Files.setPosixFilePermissions(directory, PosixFilePermissions.fromString("rwx------"));
        Process process = null;
        try {
            Path input = directory.resolve("input.zip"), output = directory.resolve("report.json");
            Files.write(input, archive); Files.setPosixFilePermissions(input, PosixFilePermissions.fromString("rw-------"));
            ProcessBuilder builder = new ProcessBuilder(node, "--max-old-space-size=96", script.toString(), input.toString());
            String path = builder.environment().get("PATH"); builder.environment().clear();
            if (path != null) builder.environment().put("PATH", path);
            builder.environment().put("HOME", directory.toString()); builder.environment().put("TMPDIR", directory.toString());
            // 使用JDK9新增的Redirect.DISCARD：不落盘不可信stderr，避免知识正文进入日志；最低运行JDK9，本工程固定JDK21。
            builder.redirectOutput(output.toFile()); builder.redirectError(ProcessBuilder.Redirect.DISCARD);
            try { process = builder.start(); } catch (IOException error) { throw new ApiException(503, "VALIDATOR_UNAVAILABLE", "固定Skill校验器未就绪"); }
            if (!process.waitFor(10, TimeUnit.SECONDS)) throw new ApiException(422, "BUNDLE_INVALID", "知识包超出校验预算");
            if (process.exitValue() != 0 || !Files.exists(output) || Files.size(output) > 131072) throw new ApiException(422, "BUNDLE_INVALID", "知识包不符合固定Skill契约或安全限额");
            JsonNode report = json.readTree(Files.readAllBytes(output));
            if (!"1.0.2".equals(report.path("skillVersion").asText()) || !"2.0".equals(report.path("contractVersion").asText()) || !report.path("digest").asText().matches("[a-f0-9]{64}")) throw new ApiException(503, "VALIDATOR_INVALID", "校验器响应不合法");
            return report;
        } finally {
            if (process != null && process.isAlive()) { process.destroyForcibly(); process.waitFor(2, TimeUnit.SECONDS); }
            // 回收本次私有目录及子进程快照；仅正常退出/可捕获异常执行finally，宿主SIGKILL或断电残留另行治理。
            Files.deleteIfExists(directory.resolve("input.zip")); Files.deleteIfExists(directory.resolve("report.json"));
            try (java.util.stream.Stream<Path> paths = Files.walk(directory)) { for (Path item : paths.sorted(java.util.Comparator.reverseOrder()).collect(java.util.stream.Collectors.toList())) Files.deleteIfExists(item); }
        }
    }
}
