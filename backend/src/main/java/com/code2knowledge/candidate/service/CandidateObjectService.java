package com.code2knowledge.candidate.service;

import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Profile;
import org.springframework.beans.factory.annotation.Value;
import com.code2knowledge.common.exception.ApiException;
import java.nio.file.*;
import java.nio.file.attribute.PosixFilePermissions;
import java.io.IOException;
import java.nio.channels.SeekableByteChannel;
import java.nio.ByteBuffer;
import java.util.HashSet;
import java.util.Set;

/** 仅本地开发的不可变对象适配；正文不写业务表，不支持分布式共享本地目录，S3由独立适配器实现。 */
@Service
@org.springframework.boot.autoconfigure.condition.ConditionalOnProperty(name = "c2k.candidate.storage", havingValue = "local", matchIfMissing = true)
@Profile("platform")
public class CandidateObjectService implements CandidateObjectStore {
    /** 专用私有对象根；不与客户仓库或临时测试根混用。 */
    private final Path root;
    /**
     * @param directory 管理员配置的独立对象目录，仅本机开发适配
     * @throws IOException 根目录无法创建或为链接时启动失败 */
    public CandidateObjectService(@Value("${c2k.candidate.objects:.local/candidate-objects}") String directory) throws IOException {
        root = Paths.get(directory).toAbsolutePath().normalize(); Files.createDirectories(root);
        if (Files.isSymbolicLink(root)) throw new IOException("对象根不能为链接");
        Files.setPosixFilePermissions(root, PosixFilePermissions.fromString("rwx------"));
    }
    /**
     * @param tenant 企业UUID
     * @param id 候选UUID
     * @param bytes 原始有界ZIP
     * @throws IOException 写入失败；CREATE_NEW防止历史覆盖 */
    public void put(String tenant, String id, byte[] bytes) throws IOException {
        Path directory = root.resolve(tenant); Files.createDirectories(directory);
        if (Files.isSymbolicLink(directory)) throw new IOException("对象目录不合法");
        Files.setPosixFilePermissions(directory, PosixFilePermissions.fromString("rwx------"));
        Path file = directory.resolve(id + ".zip");
        Set<OpenOption> options = new HashSet<>(); options.add(StandardOpenOption.CREATE_NEW); options.add(StandardOpenOption.WRITE); options.add(LinkOption.NOFOLLOW_LINKS);
        // 创建时即限定0600，避免先写入再chmod期间被同机其他用户读取知识正文。
        try (SeekableByteChannel channel = Files.newByteChannel(file, options, PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rw-------")))) {
            ByteBuffer buffer = ByteBuffer.wrap(bytes); while (buffer.hasRemaining()) channel.write(buffer);
        }
    }
    /**
     * @param tenant 已授权企业UUID
     * @param id 已授权候选UUID
     * @return 不可变ZIP，不存在返回503而非伪造空结果
     * @throws IOException 对象损坏或不可读 */
    public byte[] get(String tenant, String id) throws IOException {
        Path file = root.resolve(tenant).resolve(id + ".zip");
        if (Files.isSymbolicLink(file) || !Files.isRegularFile(file, LinkOption.NOFOLLOW_LINKS) || Files.size(file) > 8388608) throw new ApiException(503, "ARTIFACT_UNAVAILABLE", "候选原包暂不可读取");
        Set<OpenOption> options = new HashSet<>(); options.add(StandardOpenOption.READ); options.add(LinkOption.NOFOLLOW_LINKS);
        try (SeekableByteChannel channel = Files.newByteChannel(file, options)) {
            long size = channel.size();
            if (size < 1 || size > 8388608) throw new IOException("对象大小不合法");
            ByteBuffer buffer = ByteBuffer.allocate((int) size);
            while (buffer.hasRemaining()) { if (channel.read(buffer) < 0) throw new IOException("对象被截断"); }
            if (channel.read(ByteBuffer.allocate(1)) != -1) throw new IOException("对象大小发生变化");
            return buffer.array();
        }
    }
    /**
     * @param tenant 本次写入企业UUID
     * @param id 本次未提交候选UUID
     * @throws IOException 仅补偿本次新对象，不清理其他版本 */
    public void discard(String tenant, String id) throws IOException { Files.deleteIfExists(root.resolve(tenant).resolve(id + ".zip")); }
}
