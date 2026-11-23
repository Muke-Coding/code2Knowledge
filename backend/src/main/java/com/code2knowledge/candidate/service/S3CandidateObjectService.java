package com.code2knowledge.candidate.service;

import java.io.IOException;
import java.io.ByteArrayOutputStream;
import java.net.URI;
import java.time.Duration;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Profile;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import jakarta.annotation.PreDestroy;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.ResponseInputStream;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.model.*;

/** 私有S3兼容候选对象适配；不设置公开ACL、不生成签名链接，所有下载仍经服务端逐次授权与摘要复核。 */
@Service
@Profile("platform")
@ConditionalOnProperty(name = "c2k.candidate.storage", havingValue = "s3")
public class S3CandidateObjectService implements CandidateObjectStore {
    /** 固定端点客户端；只接受部署配置，禁用环境链回退到个人云账户。 */
    private final S3Client client;
    /** 运维预建私有桶；应用不创建桶、不修改桶权限。 */
    private final String bucket;
    /**
     *
     * @param endpoint 管理员配置的HTTP(S)内网对象端点，不含认证或查询串
     *
     * @param region 签名区域，不为空
     *
     * @param bucket 运维预建私有桶名，不为空
     *
     * @param accessKey 专用最小权限服务凭证，不写日志
     *
     * @param secretKey 专用服务密钥，不写日志
     *
     * @throws IllegalArgumentException 配置缺失或端点不合法时拒绝启动，不回显配置内容
     */
    public S3CandidateObjectService(@Value("${c2k.candidate.s3-endpoint:}") String endpoint, @Value("${c2k.candidate.s3-region:us-east-1}") String region, @Value("${c2k.candidate.s3-bucket:}") String bucket, @Value("${c2k.candidate.s3-access-key:}") String accessKey, @Value("${c2k.candidate.s3-secret-key:}") String secretKey) {
        URI address;
        try { address = URI.create(endpoint); } catch (RuntimeException error) { throw new IllegalArgumentException("对象存储端点不合法"); }
        if ((!"https".equals(address.getScheme()) && !"http".equals(address.getScheme())) || address.getHost() == null || address.getUserInfo() != null || address.getQuery() != null || address.getFragment() != null || !bucket.matches("[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]") || accessKey.isEmpty() || secretKey.isEmpty() || region.isEmpty()) throw new IllegalArgumentException("对象存储配置不完整或不合法");
        this.bucket = bucket;
        client = S3Client.builder().endpointOverride(address).region(Region.of(region)).credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create(accessKey, secretKey)))
            .serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(true).build())
            .overrideConfiguration(config -> config.apiCallTimeout(Duration.ofSeconds(15)).apiCallAttemptTimeout(Duration.ofSeconds(10))).build();
    }
    /**
     * @param tenant 认证企业UUID
     * @param id 平台新候选UUID
     * @param bytes 最大8MiB原包
     * @throws IOException 条件写入失败；If-None-Match保证同键不能覆盖历史 */
    @Override
    public void put(String tenant, String id, byte[] bytes) throws IOException {
        if (bytes == null || bytes.length < 1 || bytes.length > 8388608) throw new IOException("对象大小不合法");
        try { client.putObject(PutObjectRequest.builder().bucket(bucket).key(key(tenant, id)).ifNoneMatch("*").contentType("application/zip").build(), RequestBody.fromBytes(bytes)); }
        catch (S3Exception error) { if (error.statusCode() == 412) throw new java.nio.file.FileAlreadyExistsException("候选键已存在"); throw new IOException("对象写入失败"); }
        catch (RuntimeException error) { throw new IOException("对象写入失败"); }
    }
    /**
     * @param tenant 授权企业UUID
     * @param id 授权候选UUID
     * @return 有界原始ZIP；完整性由调用方再次验证
     * @throws IOException 缺失、超限或服务失败，不返回存储端响应 */
    @Override
    public byte[] get(String tenant, String id) throws IOException {
        try (ResponseInputStream<GetObjectResponse> input = client.getObject(GetObjectRequest.builder().bucket(bucket).key(key(tenant, id)).build())) {
            Long size = input.response().contentLength(); if (size == null || size < 1 || size > 8388608) { input.abort(); throw new IOException("对象大小不合法"); }
            ByteArrayOutputStream output = new ByteArrayOutputStream(size.intValue()); byte[] buffer = new byte[8192]; int length;
            while ((length = input.read(buffer)) != -1) { if (output.size() + length > size) { input.abort(); throw new IOException("对象超出声明大小"); } output.write(buffer, 0, length); }
            if (output.size() != size) throw new IOException("对象被截断"); return output.toByteArray();
        } catch (RuntimeException error) { throw new IOException("对象读取失败"); }
    }
    /**
     * @param tenant 本次未提交企业UUID
     * @param id 本次未提交候选UUID
     * @throws IOException 补偿失败；调用方不得传已提交候选键 */
    @Override
    public void discard(String tenant, String id) throws IOException { try { client.deleteObject(DeleteObjectRequest.builder().bucket(bucket).key(key(tenant, id)).build()); } catch (RuntimeException error) { throw new IOException("对象补偿失败"); } }
    /**
     * @param tenant 企业UUID
     * @param id 候选UUID
     * @return 平台命名空间键，无本机路径
     * @throws IllegalArgumentException 非标准UUID不进入SDK */
    private String key(String tenant, String id) { if (!UUID.fromString(tenant).toString().equals(tenant) || !UUID.fromString(id).toString().equals(id)) throw new IllegalArgumentException("对象键不合法"); return "candidates/" + tenant + "/" + id + ".zip"; }
    /** 释放SDK连接池；不删除任何已提交对象。 */
    @PreDestroy
    public void close() { client.close(); }
}
