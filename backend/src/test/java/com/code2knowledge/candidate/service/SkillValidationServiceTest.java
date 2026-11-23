package com.code2knowledge.candidate.service;

import com.code2knowledge.common.exception.ApiException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

/** 固定校验器进程预算实测；用真实Node子进程和临时闸门控制运行，不模拟Semaphore或读取客户资料。 */
class SkillValidationServiceTest {
    /**
     * 同时两个真实子进程占满预算时第三个立即503；正常完成、子进程失败及启动失败均归还许可。
     * @throws Exception 进程、文件、并发等待或断言失败；finally释放闸门并回收线程及专属目录
     */
    @Test
    void boundedRealProcessesReleaseAfterSuccessAndFailure() throws Exception {
        Path root = Files.createTempDirectory("c2k-validator-capacity-test-"); ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Path script = root.resolve("validator.mjs"); ObjectMapper json = new ObjectMapper();
            // 合成校验器只用显式测试目录标记进程状态；业务实现仍负责96MiB预算和10秒终止。
            String program = "/** 合成校验进程，仅用于验证启动、并发及释放。 */\nimport fs from 'node:fs';\nconst root=" + json.writeValueAsString(root.toString()) + ";\nconst tag=fs.readFileSync(process.argv[2],'utf8');\nif(tag==='fail') process.exit(1);\nfs.writeFileSync(root+'/'+tag,'started');\nwhile(!fs.existsSync(root+'/release')) await new Promise(resolve=>setTimeout(resolve,20));\nprocess.stdout.write(JSON.stringify({skillVersion:'1.0.2',contractVersion:'2.0',digest:'a'.repeat(64)}));\n";
            Files.write(script, program.getBytes(StandardCharsets.UTF_8));
            String node = System.getenv().getOrDefault("C2K_CANDIDATE_NODE", "node"); SkillValidationService service = new SkillValidationService(node, script.toString(), json);
            Future<?> first = pool.submit(() -> { try { service.validate("first".getBytes(StandardCharsets.UTF_8)); } catch (Exception error) { throw new IllegalStateException(error); } });
            Future<?> second = pool.submit(() -> { try { service.validate("second".getBytes(StandardCharsets.UTF_8)); } catch (Exception error) { throw new IllegalStateException(error); } });
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
            while ((!Files.exists(root.resolve("first")) || !Files.exists(root.resolve("second"))) && System.nanoTime() < deadline) Thread.sleep(20);
            assertTrue(Files.exists(root.resolve("first"))); assertTrue(Files.exists(root.resolve("second")));
            long start = System.nanoTime(); ApiException busy = assertThrows(ApiException.class, () -> service.validate(new byte[] { 1 })); assertEquals(503, busy.getStatus()); assertTrue(System.nanoTime() - start < TimeUnit.MILLISECONDS.toNanos(500));
            Files.write(root.resolve("release"), new byte[] { 1 }); first.get(5, TimeUnit.SECONDS); second.get(5, TimeUnit.SECONDS);
            for (int count = 0; count < 3; count++) { ApiException failed = assertThrows(ApiException.class, () -> service.validate("fail".getBytes(StandardCharsets.UTF_8))); assertEquals(422, failed.getStatus()); }
            SkillValidationService unavailable = new SkillValidationService(root.resolve("missing-node").toString(), script.toString(), json);
            for (int count = 0; count < 3; count++) { ApiException failed = assertThrows(ApiException.class, () -> unavailable.validate(new byte[] { 1 })); assertEquals(503, failed.getStatus()); }
            assertEquals("1.0.2", service.validate("after".getBytes(StandardCharsets.UTF_8)).get("skillVersion").asText());
        } finally {
            Files.write(root.resolve("release"), new byte[] { 1 }); pool.shutdownNow(); assertTrue(pool.awaitTermination(5, TimeUnit.SECONDS));
            try (java.util.stream.Stream<Path> paths = Files.walk(root)) { for (Path path : paths.sorted(java.util.Comparator.reverseOrder()).collect(java.util.stream.Collectors.toList())) Files.deleteIfExists(path); }
        }
    }
}
