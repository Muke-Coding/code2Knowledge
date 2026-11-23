package com.code2knowledge.identity;

import com.code2knowledge.candidate.service.S3CandidateObjectService;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.io.IOException;
import org.junit.jupiter.api.Test;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.model.CreateBucketRequest;
import static org.junit.jupiter.api.Assertions.*;

/** 独立MinIO实测不可变对象适配；随机容器与临时凭证仅驻内存，不使用业务容器、配置或宿主持久卷。 */
class S3ObjectIT {
    /**
     * 验证私有默认桶匿名403、有界原样读取、条件写入拒绝覆盖与补偿删除；容器无卷且finally销毁。
     * @throws Exception Docker、MinIO就绪或断言失败，均不得视为存储通过
     */
    @Test
    void privateImmutableObjectsAndCompensation() throws Exception {
        String name = "c2k-s3-it-" + UUID.randomUUID().toString().substring(0, 8);
        String access = UUID.randomUUID().toString().replace("-", ""), secret = UUID.randomUUID().toString().replace("-", "");
        String image = System.getenv().getOrDefault("C2K_MINIO_TEST_IMAGE", "quay.io/minio/minio:RELEASE.2025-04-22T22-12-26Z");
        ProcessBuilder launch = new ProcessBuilder("docker", "run", "-d", "--rm", "--name", name, "-p", "127.0.0.1::9000", "-e", "MINIO_ROOT_USER", "-e", "MINIO_ROOT_PASSWORD", image, "server", "/data");
        launch.environment().put("MINIO_ROOT_USER", access); launch.environment().put("MINIO_ROOT_PASSWORD", secret); launch.redirectOutput(ProcessBuilder.Redirect.DISCARD); launch.redirectError(ProcessBuilder.Redirect.DISCARD);
        try {
            Process process = launch.start(); assertTrue(process.waitFor(60, TimeUnit.SECONDS), "隔离对象容器必须及时启动"); assertEquals(0, process.exitValue(), "隔离对象容器启动失败");
            Process port = new ProcessBuilder("docker", "port", name, "9000/tcp").redirectError(ProcessBuilder.Redirect.DISCARD).start();
            assertTrue(port.waitFor(5, TimeUnit.SECONDS)); String endpoint = "http://" + new String(port.getInputStream().readAllBytes(), java.nio.charset.StandardCharsets.UTF_8).trim();
            HttpClient http = HttpClient.newBuilder().connectTimeout(java.time.Duration.ofSeconds(2)).build(); boolean ready = false;
            for (int count = 0; count < 40; count++) { try { ready = http.send(HttpRequest.newBuilder(URI.create(endpoint + "/minio/health/live")).timeout(java.time.Duration.ofSeconds(2)).GET().build(), HttpResponse.BodyHandlers.discarding()).statusCode() == 200; } catch (IOException ignored) { /* 只容忍独立服务尚未就绪，不忽略最终超时。 */ } if (ready) break; Thread.sleep(250); }
            assertTrue(ready, "隔离MinIO必须就绪");
            try (S3Client client = S3Client.builder().endpointOverride(URI.create(endpoint)).region(Region.US_EAST_1).credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create(access, secret))).serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(true).build()).build()) { client.createBucket(CreateBucketRequest.builder().bucket("candidate-test").build()); }
            S3CandidateObjectService store = new S3CandidateObjectService(endpoint, "us-east-1", "candidate-test", access, secret);
            try {
                String tenant = UUID.randomUUID().toString(), id = UUID.randomUUID().toString(); byte[] original = new byte[] { 1, 2, 3 };
                store.put(tenant, id, original); assertArrayEquals(original, store.get(tenant, id));
                assertThrows(IOException.class, () -> store.put(tenant, id, new byte[] { 4 })); assertArrayEquals(original, store.get(tenant, id));
                int anonymous = http.send(HttpRequest.newBuilder(URI.create(endpoint + "/candidate-test/candidates/" + tenant + "/" + id + ".zip")).GET().build(), HttpResponse.BodyHandlers.discarding()).statusCode(); assertEquals(403, anonymous);
                store.discard(tenant, id); assertThrows(IOException.class, () -> store.get(tenant, id)); store.discard(tenant, id);
            } finally { store.close(); }
        } finally { Process cleanup = new ProcessBuilder("docker", "rm", "-f", name).redirectOutput(ProcessBuilder.Redirect.DISCARD).redirectError(ProcessBuilder.Redirect.DISCARD).start(); if (!cleanup.waitFor(10, TimeUnit.SECONDS)) cleanup.destroyForcibly(); }
    }
}
